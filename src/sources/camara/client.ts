import type { z } from "zod";
import { splitDateRange } from "./date-ranges";
import {
  deputadoDetalheSchema,
  deputadoResumoSchema,
  detailResponse,
  legislaturaSchema,
  listResponse,
  orientacaoSchema,
  proposicaoResumoSchema,
  votacaoResumoSchema,
  votoSchema,
  type DeputadoDetalhe,
  type DeputadoResumo,
  type Legislatura,
  type Orientacao,
  type Page,
  type ProposicaoResumo,
  type VotacaoResumo,
  type Voto,
} from "./schemas";

export const CAMARA_API_URL = "https://dadosabertos.camara.leg.br/api/v2";
const ID_ORGAO_PLENARIO = 180;
// A API recusa filtros de votação com mais de 3 meses entre as datas.
const VOTACOES_MAX_DIAS = 90;
const RETRY_BASE_DELAY_MS = 500;
// Um Retry-After enorme (ex.: 3600) não pode deixar o job parado por uma hora.
const RETRY_AFTER_MAX_MS = 60_000;

export class CamaraHttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    detail: string,
  ) {
    super(`API da Câmara respondeu ${status} em ${url}${detail ? `: ${detail}` : ""}`);
    this.name = "CamaraHttpError";
  }
}

export class CamaraSchemaError extends Error {
  constructor(
    readonly url: string,
    readonly issues: z.core.$ZodIssue[],
  ) {
    super(`Resposta inesperada da API da Câmara em ${url}: ${issues.length} problema(s)`);
    this.name = "CamaraSchemaError";
  }
}

export interface CamaraClientOptions {
  baseUrl?: string;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  maxRetries?: number;
  timeoutMs?: number;
  /** Intervalo mínimo entre requisições (200 ms ≈ 5 req/s). */
  minIntervalMs?: number;
  maxPages?: number;
}

export interface CamaraClient {
  listDeputados(filtro?: { idLegislatura?: number }): Promise<DeputadoResumo[]>;
  getDeputado(id: number): Promise<DeputadoDetalhe>;
  listLegislaturas(): Promise<Legislatura[]>;
  listVotacoesPlenario(periodo: { dataInicio: string; dataFim: string }): Promise<VotacaoResumo[]>;
  getVotos(idVotacao: string): Promise<Voto[]>;
  getOrientacoes(idVotacao: string): Promise<Orientacao[]>;
  listProposicoesPorAutor(idDeputado: number, siglaTipos: readonly string[]): Promise<ProposicaoResumo[]>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof TypeError) return true; // falha de rede do fetch
  return error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
}

interface RawResponse {
  ok: boolean;
  status: number;
  retryAfterMs: number | null;
  body: unknown;
}

function retryAfterMs(response: Response): number | null {
  const seconds = Number(response.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, RETRY_AFTER_MAX_MS) : null;
}

/** Corpo de erro é opcional: se não for JSON, segue sem detalhe. Corpo de sucesso precisa ser JSON. */
async function readBody(response: Response): Promise<unknown> {
  if (response.ok) return response.json();
  try {
    return await response.json();
  } catch (error) {
    if (isRetryableError(error)) throw error;
    return null;
  }
}

function errorDetail(body: unknown): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  return typeof detail === "string" ? detail : "";
}

function buildQuery(params: ReadonlyArray<readonly [string, string | number]>): string {
  return new URLSearchParams(params.map(([key, value]) => [key, String(value)])).toString();
}

export function createCamaraClient(options: CamaraClientOptions = {}): CamaraClient {
  const baseUrl = options.baseUrl ?? CAMARA_API_URL;
  const fetchFn = options.fetchFn ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  const maxRetries = options.maxRetries ?? 3;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const minIntervalMs = options.minIntervalMs ?? 200;
  const maxPages = options.maxPages ?? 1_000;
  let lastRequestAt: number | null = null;

  async function throttle(): Promise<void> {
    if (lastRequestAt !== null) {
      const wait = minIntervalMs - (now() - lastRequestAt);
      if (wait > 0) await sleep(wait);
    }
    lastRequestAt = now();
  }

  // O tempo limite cobre cabeçalhos E corpo: uma resposta que trava no meio também é abortada.
  async function fetchOnce(url: string): Promise<RawResponse> {
    await throttle();
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new DOMException("Tempo limite excedido", "TimeoutError")),
      timeoutMs,
    );
    try {
      // redirect "error": um 3xx levaria o job a outro host sem passar por assertSameApi.
      const response = await fetchFn(url, {
        headers: { accept: "application/json" },
        signal: controller.signal,
        redirect: "error",
      });
      return {
        ok: response.ok,
        status: response.status,
        retryAfterMs: retryAfterMs(response),
        body: await readBody(response),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async function requestJson<T extends z.ZodType>(url: string, schema: T): Promise<z.output<T>> {
    for (let attempt = 0; ; attempt++) {
      const backoff = RETRY_BASE_DELAY_MS * 2 ** attempt;
      const canRetry = attempt < maxRetries;
      let response: RawResponse;
      try {
        response = await fetchOnce(url);
      } catch (error) {
        if (!canRetry || !isRetryableError(error)) throw error;
        await sleep(backoff);
        continue;
      }
      if (response.ok) {
        const parsed = schema.safeParse(response.body);
        if (!parsed.success) throw new CamaraSchemaError(url, parsed.error.issues);
        return parsed.data;
      }
      if (!canRetry || !isRetryableStatus(response.status)) {
        throw new CamaraHttpError(response.status, url, errorDetail(response.body));
      }
      await sleep(response.retryAfterMs ?? backoff);
    }
  }

  function assertSameApi(nextUrl: string): void {
    const base = new URL(baseUrl);
    const next = new URL(nextUrl);
    const dentroDaApi = next.pathname === base.pathname || next.pathname.startsWith(`${base.pathname}/`);
    if (next.origin !== base.origin || !dentroDaApi) {
      throw new Error(`Link de paginação fora da API da Câmara: ${next.origin}`);
    }
  }

  async function listAll<T extends z.ZodType>(firstUrl: string, item: T): Promise<z.output<T>[]> {
    const schema = listResponse(item);
    const pages: z.output<T>[][] = [];
    let url: string | null = firstUrl;
    while (url) {
      if (pages.length >= maxPages) throw new Error(`Paginação passou de ${maxPages} páginas em ${firstUrl}`);
      const page: Page<z.output<T>> = await requestJson(url, schema);
      pages.push(page.dados);
      if (page.nextUrl) assertSameApi(page.nextUrl);
      url = page.nextUrl;
    }
    return pages.flat();
  }

  const url = (path: string, params: ReadonlyArray<readonly [string, string | number]> = []) =>
    params.length ? `${baseUrl}/${path}?${buildQuery(params)}` : `${baseUrl}/${path}`;

  return {
    listDeputados: ({ idLegislatura } = {}) =>
      listAll(
        url("deputados", [...(idLegislatura ? [["idLegislatura", idLegislatura] as const] : []), ["itens", 100]]),
        deputadoResumoSchema,
      ),

    getDeputado: async (id) =>
      (await requestJson(url(`deputados/${id}`), detailResponse(deputadoDetalheSchema))).dados,

    listLegislaturas: () => listAll(url("legislaturas", [["itens", 100]]), legislaturaSchema),

    listVotacoesPlenario: async ({ dataInicio, dataFim }) => {
      const results: VotacaoResumo[][] = [];
      for (const janela of splitDateRange(dataInicio, dataFim, VOTACOES_MAX_DIAS)) {
        const params = [
          ["idOrgao", ID_ORGAO_PLENARIO],
          ["dataInicio", janela.inicio],
          ["dataFim", janela.fim],
          ["itens", 200],
        ] as const;
        results.push(await listAll(url("votacoes", params), votacaoResumoSchema));
      }
      return results.flat();
    },

    getVotos: (idVotacao) => listAll(url(`votacoes/${encodeURIComponent(idVotacao)}/votos`), votoSchema),

    getOrientacoes: (idVotacao) =>
      listAll(url(`votacoes/${encodeURIComponent(idVotacao)}/orientacoes`), orientacaoSchema),

    listProposicoesPorAutor: (idDeputado, siglaTipos) =>
      listAll(
        url("proposicoes", [
          ["idDeputadoAutor", idDeputado],
          ...siglaTipos.map((tipo) => ["siglaTipo", tipo] as const),
          ["itens", 100],
          ["ordem", "ASC"],
          ["ordenarPor", "id"],
        ]),
        proposicaoResumoSchema,
      ),
  };
}

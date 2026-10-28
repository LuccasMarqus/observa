import { describe, expect, it, vi } from "vitest";
import {
  CamaraHttpError,
  CamaraSchemaError,
  createCamaraClient,
  type CamaraClientOptions,
} from "@/src/sources/camara/client";
import deputadoDetalhe from "../../fixtures/camara/deputado-detalhe.json";

const BASE = "https://dadosabertos.camara.leg.br/api/v2";

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function deputado(id: number) {
  return { id, nome: `Dep ${id}`, siglaPartido: "X", siglaUf: "SP", idLegislatura: 57, urlFoto: null, email: null };
}

function setup(responses: Array<Response | Error>, extra: Partial<CamaraClientOptions> = {}) {
  const queue = [...responses];
  const fetchFn = vi.fn<typeof fetch>(async () => {
    const next = queue.shift();
    if (!next) throw new Error("fetch chamado mais vezes que o esperado");
    if (next instanceof Error) throw next;
    return next;
  });
  const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
  const client = createCamaraClient({ fetchFn, sleep, minIntervalMs: 0, now: () => 0, ...extra });
  const urls = () => fetchFn.mock.calls.map(([url]) => String(url));
  return { client, fetchFn, sleep, urls };
}

describe("cliente da API da Câmara", () => {
  describe("paginação", () => {
    it("segue o link next e junta todas as páginas", async () => {
      const { client, urls } = setup([
        json({ dados: [deputado(1)], links: [{ rel: "next", href: `${BASE}/deputados?pagina=2&itens=100` }] }),
        json({ dados: [deputado(2)], links: [] }),
      ]);

      const result = await client.listDeputados({ idLegislatura: 57 });

      expect(result.map((d) => d.id)).toEqual([1, 2]);
      expect(urls()[0]).toBe(`${BASE}/deputados?idLegislatura=57&itens=100`);
    });

    it("recusa seguir link next para outro domínio", async () => {
      const { client } = setup([
        json({ dados: [deputado(1)], links: [{ rel: "next", href: "https://evil.example/deputados" }] }),
      ]);

      await expect(client.listDeputados()).rejects.toThrow(/fora da API da Câmara/);
    });

    it("recusa link next com prefixo parecido mas fora do caminho da API", async () => {
      const { client } = setup([
        json({ dados: [deputado(1)], links: [{ rel: "next", href: "https://dadosabertos.camara.leg.br/api/v2evil/x" }] }),
      ]);

      await expect(client.listDeputados()).rejects.toThrow(/fora da API da Câmara/);
    });

    it("interrompe paginação que não termina", async () => {
      const loop = () =>
        json({ dados: [deputado(1)], links: [{ rel: "next", href: `${BASE}/deputados?pagina=2` }] });
      const { client } = setup([loop(), loop(), loop()], { maxPages: 2 });

      await expect(client.listDeputados()).rejects.toThrow(/páginas/);
    });
  });

  describe("novas tentativas", () => {
    it("tenta de novo em 503 com backoff exponencial", async () => {
      const { client, sleep } = setup([
        new Response("", { status: 503 }),
        new Response("", { status: 503 }),
        json({ dados: [], links: [] }),
      ]);

      await client.listLegislaturas();

      expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([500, 1000]);
    });

    it("respeita o Retry-After em 429", async () => {
      const { client, sleep } = setup([
        new Response("", { status: 429, headers: { "retry-after": "2" } }),
        json({ dados: [], links: [] }),
      ]);

      await client.listLegislaturas();

      expect(sleep).toHaveBeenCalledWith(2000);
    });

    it("limita a espera do Retry-After a 60 segundos", async () => {
      const { client, sleep } = setup([
        new Response("", { status: 503, headers: { "retry-after": "3600" } }),
        json({ dados: [], links: [] }),
      ]);

      await client.listLegislaturas();

      expect(sleep).toHaveBeenCalledWith(60_000);
    });

    it("tenta de novo em erro de rede", async () => {
      const { client, fetchFn } = setup([new TypeError("fetch failed"), json({ dados: [], links: [] })]);

      await client.listLegislaturas();

      expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    it("desiste depois do máximo de tentativas", async () => {
      const { client, fetchFn } = setup(
        [new Response("", { status: 503 }), new Response("", { status: 503 })],
        { maxRetries: 1 },
      );

      await expect(client.listLegislaturas()).rejects.toMatchObject({ status: 503 });
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    it("não tenta de novo em 400 e expõe o detalhe da API", async () => {
      const { client, fetchFn } = setup([
        json({ status: 400, detail: "Parâmetro(s) inválido(s)." }, { status: 400 }),
      ]);

      const error = await client.listLegislaturas().catch((e: unknown) => e);

      expect(error).toBeInstanceOf(CamaraHttpError);
      expect(error).toMatchObject({ status: 400, message: expect.stringContaining("Parâmetro(s) inválido(s).") });
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it("aborta requisição que passa do tempo limite e tenta de novo", async () => {
      const hanging = vi.fn(
        (_url: string | URL | Request, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
          }),
      );
      const fetchFn = vi
        .fn<typeof fetch>()
        .mockImplementationOnce(hanging)
        .mockResolvedValueOnce(json({ dados: [], links: [] }));
      const client = createCamaraClient({ fetchFn, sleep: async () => {}, timeoutMs: 5, minIntervalMs: 0 });

      await client.listLegislaturas();

      expect(fetchFn).toHaveBeenCalledTimes(2);
    });
  });

  it("aborta e tenta de novo quando o corpo da resposta trava depois dos cabeçalhos", async () => {
    const stalledBody = vi.fn<typeof fetch>(async (...args) => {
      const signal = args[1]?.signal;
      const body = new ReadableStream({
        start(controller) {
          signal?.addEventListener("abort", () => controller.error(signal.reason));
        },
      });
      return new Response(body, { status: 200 });
    });
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(stalledBody)
      .mockResolvedValueOnce(json({ dados: [], links: [] }));
    const client = createCamaraClient({ fetchFn, sleep: async () => {}, timeoutMs: 5, minIntervalMs: 0 });

    await client.listLegislaturas();

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("falha com CamaraSchemaError quando a resposta muda de formato", async () => {
    const { client } = setup([json({ dados: [{ id: "não é número" }], links: [] })]);

    await expect(client.listLegislaturas()).rejects.toBeInstanceOf(CamaraSchemaError);
  });

  it("espera o intervalo mínimo entre requisições", async () => {
    const { client, sleep } = setup(
      [json({ dados: [], links: [] }), json({ dados: [], links: [] })],
      { minIntervalMs: 200, now: () => 1000 },
    );

    await client.listLegislaturas();
    await client.listLegislaturas();

    expect(sleep).toHaveBeenCalledWith(200);
  });

  it("pede JSON à API", async () => {
    const { client, fetchFn } = setup([json({ dados: [], links: [] })]);

    await client.listLegislaturas();

    const headers = new Headers(fetchFn.mock.calls[0][1]?.headers);
    expect(headers.get("accept")).toBe("application/json");
  });

  it("não segue redirecionamentos (evita sair da API sem checagem)", async () => {
    const { client, fetchFn } = setup([json({ dados: [], links: [] })]);

    await client.listLegislaturas();

    expect(fetchFn.mock.calls[0][1]?.redirect).toBe("error");
  });

  describe("recursos", () => {
    it("busca o detalhe do deputado sem o CPF", async () => {
      const { client, urls } = setup([json(deputadoDetalhe)]);

      const result = await client.getDeputado(204379);

      expect(urls()[0]).toBe(`${BASE}/deputados/204379`);
      expect(result).not.toHaveProperty("cpf");
    });

    it("divide o período de votações do Plenário em janelas de até 3 meses", async () => {
      const { client, urls } = setup([json({ dados: [], links: [] }), json({ dados: [], links: [] })]);

      await client.listVotacoesPlenario({ dataInicio: "2026-01-01", dataFim: "2026-05-31" });

      expect(urls()).toEqual([
        `${BASE}/votacoes?idOrgao=180&dataInicio=2026-01-01&dataFim=2026-03-31&itens=200`,
        `${BASE}/votacoes?idOrgao=180&dataInicio=2026-04-01&dataFim=2026-05-31&itens=200`,
      ]);
    });

    it("busca votos e orientações de uma votação", async () => {
      const { client, urls } = setup([json({ dados: [], links: [] }), json({ dados: [], links: [] })]);

      await client.getVotos("2236186-60");
      await client.getOrientacoes("2236186-60");

      expect(urls()).toEqual([`${BASE}/votacoes/2236186-60/votos`, `${BASE}/votacoes/2236186-60/orientacoes`]);
    });

    it("codifica o id da votação na URL", async () => {
      const { client, urls } = setup([json({ dados: [], links: [] })]);

      await client.getVotos("../deputados");

      expect(urls()[0]).toBe(`${BASE}/votacoes/..%2Fdeputados/votos`);
    });

    it("filtra proposições por autor e tipos", async () => {
      const { client, urls } = setup([json({ dados: [], links: [] })]);

      await client.listProposicoesPorAutor(204379, ["PL", "PEC", "PLP"]);

      expect(urls()[0]).toBe(
        `${BASE}/proposicoes?idDeputadoAutor=204379&siglaTipo=PL&siglaTipo=PEC&siglaTipo=PLP&itens=100&ordem=ASC&ordenarPor=id`,
      );
    });
  });
});

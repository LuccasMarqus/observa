import { unzipSync } from "fflate";

const URL_COTAS = "https://www.camara.leg.br/cotas";
// O zip de 2026 tem ~4,5 MB e o CSV ~45 MB; os limites dão folga e barram arquivos anômalos.
const MAX_BYTES_ZIP = 50 * 1024 * 1024;
const MAX_BYTES_CSV = 300 * 1024 * 1024;
const TIMEOUT_MS = 120_000;

export interface OpcoesDownload {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
  maxBytesDescompactado?: number;
}

function validarAno(ano: number): void {
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) throw new Error(`Ano inválido: ${ano}`);
}

async function baixarZip(url: string, fetchFn: typeof fetch, timeoutMs: number, maxBytes: number): Promise<Uint8Array> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException("Tempo limite excedido", "TimeoutError")),
    timeoutMs,
  );
  try {
    const response = await fetchFn(url, { signal: controller.signal, redirect: "error" });
    if (!response.ok) throw new Error(`Download de ${url} respondeu ${response.status}`);
    if (Number(response.headers.get("content-length")) > maxBytes) {
      throw new Error(`Arquivo ${url} passa do limite de ${maxBytes} bytes`);
    }
    return await lerComLimite(response, url, maxBytes, controller);
  } finally {
    clearTimeout(timer);
  }
}

/** Lê o corpo aos pedaços e aborta ao passar do limite: sem content-length, não confia no tamanho. */
async function lerComLimite(response: Response, url: string, maxBytes: number, controller: AbortController): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array(await response.arrayBuffer());
  const pedacos: Uint8Array[] = [];
  let total = 0;
  for await (const pedaco of response.body as unknown as AsyncIterable<Uint8Array>) {
    total += pedaco.byteLength;
    if (total > maxBytes) {
      controller.abort();
      throw new Error(`Arquivo ${url} passa do limite de ${maxBytes} bytes`);
    }
    pedacos.push(pedaco);
  }
  return Buffer.concat(pedacos);
}

/** Baixa https://www.camara.leg.br/cotas/Ano-AAAA.csv.zip e devolve o CSV descompactado. */
export async function baixarArquivoCotas(ano: number, opcoes: OpcoesDownload = {}): Promise<Buffer> {
  validarAno(ano);
  const nome = `Ano-${ano}.csv`;
  const maxDescompactado = opcoes.maxBytesDescompactado ?? MAX_BYTES_CSV;
  const zip = await baixarZip(
    `${URL_COTAS}/${nome}.zip`,
    opcoes.fetchFn ?? fetch,
    opcoes.timeoutMs ?? TIMEOUT_MS,
    opcoes.maxBytes ?? MAX_BYTES_ZIP,
  );
  const arquivos = unzipSync(zip, {
    // Checa o tamanho declarado antes de descompactar (proteção contra zip bomb).
    filter: (arquivo) => {
      if (arquivo.name !== nome) return false;
      if (arquivo.originalSize > maxDescompactado) {
        throw new Error(`${nome} descompactado passa do limite de ${maxDescompactado} bytes`);
      }
      return true;
    },
  });
  const csv = arquivos[nome];
  if (!csv) throw new Error(`O zip de cotas não contém ${nome}`);
  // O tamanho declarado no zip pode mentir: confere o real também.
  if (csv.byteLength > maxDescompactado) {
    throw new Error(`${nome} descompactado passa do limite de ${maxDescompactado} bytes`);
  }
  return Buffer.from(csv);
}

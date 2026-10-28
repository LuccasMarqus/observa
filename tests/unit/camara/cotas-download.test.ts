import { strToU8, zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import { baixarArquivoCotas } from "@/src/sources/camara/cotas-download";

function zipCom(arquivos: Record<string, string>): Uint8Array {
  return zipSync(Object.fromEntries(Object.entries(arquivos).map(([nome, texto]) => [nome, strToU8(texto)])));
}

function resposta(corpo: Uint8Array, init: ResponseInit = {}): Response {
  return new Response(Buffer.from(corpo), { status: 200, headers: { "content-type": "application/zip" }, ...init });
}

describe("baixarArquivoCotas", () => {
  it("baixa o zip do ano e devolve o CSV de dentro", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => resposta(zipCom({ "Ano-2026.csv": "a;b\n1;2\n" })));

    const csv = await baixarArquivoCotas(2026, { fetchFn });

    expect(csv.toString("utf8")).toBe("a;b\n1;2\n");
    expect(String(fetchFn.mock.calls[0][0])).toBe("https://www.camara.leg.br/cotas/Ano-2026.csv.zip");
    expect(fetchFn.mock.calls[0][1]?.redirect).toBe("error");
  });

  it("falha com o status quando o servidor não devolve 200", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response("", { status: 404 }));

    await expect(baixarArquivoCotas(2026, { fetchFn })).rejects.toThrow(/404/);
  });

  it("recusa arquivo maior que o limite", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => resposta(new Uint8Array(2_000)));

    await expect(baixarArquivoCotas(2026, { fetchFn, maxBytes: 1_000 })).rejects.toThrow(/limite/);
  });

  it("interrompe a leitura ao passar do limite, mesmo sem content-length (corpo infinito)", async () => {
    const infinito = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(512));
      },
    });
    const fetchFn = vi.fn<typeof fetch>(async () => new Response(infinito, { status: 200 }));

    await expect(baixarArquivoCotas(2026, { fetchFn, maxBytes: 4_096 })).rejects.toThrow(/limite/);
  });

  it("recusa CSV descompactado maior que o limite (zip bomb)", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => resposta(zipCom({ "Ano-2026.csv": "x".repeat(5_000) })));

    await expect(baixarArquivoCotas(2026, { fetchFn, maxBytesDescompactado: 1_000 })).rejects.toThrow(/limite/);
  });

  it("falha se o zip não tiver o CSV do ano", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => resposta(zipCom({ "outro.txt": "x" })));

    await expect(baixarArquivoCotas(2026, { fetchFn })).rejects.toThrow(/Ano-2026\.csv/);
  });

  it.each([1999, 2101, 2026.5])("rejeita ano inválido %s sem fazer requisição", async (ano) => {
    const fetchFn = vi.fn<typeof fetch>();

    await expect(baixarArquivoCotas(ano, { fetchFn })).rejects.toThrow(/ano/i);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from "vitest";
import { syncDespesas, type DespesaRow, type SyncDespesasDeps } from "@/src/ingest/sync-despesas";
import type { DespesaCota, LeituraCotas } from "@/src/sources/camara/cotas";

const AGORA = new Date("2026-10-27T12:00:00Z");

function despesa(idDeputado: number, chave: string, valorLiquidoCentavos = 1000): DespesaCota {
  return {
    chave,
    idDeputado,
    ano: 2026,
    mes: 3,
    categoria: "TELEFONIA",
    fornecedor: "OPERADORA",
    documentoFornecedor: "32.373.812/0001-79",
    valorLiquidoCentavos,
    dataEmissao: "2026-03-26",
    urlDocumento: null,
  };
}

function leitura(despesas: DespesaCota[], extra: Partial<LeituraCotas> = {}): LeituraCotas {
  return { despesas, semDeputado: 0, duplicadas: 0, invalidas: 0, primeiroErro: null, ...extra };
}

function setup(lido: LeituraCotas | Error, conhecidos = [1, 2]) {
  return {
    obterDespesas: vi.fn(async () => {
      if (lido instanceof Error) throw lido;
      return lido;
    }),
    despesas: {
      idsDeputadosConhecidos: vi.fn(async (ids: readonly number[]) => new Set(ids.filter((id) => conhecidos.includes(id)))),
      contarAno: vi.fn(async (): Promise<number> => 0),
      substituirAno: vi.fn<(ano: number, rows: readonly DespesaRow[]) => Promise<void>>(async () => {}),
    },
    ingestao: { start: vi.fn(async () => 3), finish: vi.fn(async () => {}) },
    now: () => AGORA,
  } satisfies SyncDespesasDeps;
}

describe("syncDespesas", () => {
  it("substitui as despesas do ano pelas do arquivo", async () => {
    const deps = setup(leitura([despesa(1, "a"), despesa(2, "b")]));

    const result = await syncDespesas(deps, 2026);

    expect(result).toEqual({ status: "sucesso", lidos: 2, gravados: 2, falhas: [] });
    expect(deps.obterDespesas).toHaveBeenCalledWith(2026);
    expect(deps.despesas.substituirAno).toHaveBeenCalledWith(2026, [
      {
        chave: "a",
        deputadoId: 1,
        ano: 2026,
        mes: 3,
        categoria: "TELEFONIA",
        fornecedor: "OPERADORA",
        documentoFornecedor: "32.373.812/0001-79",
        valorLiquidoCentavos: 1000,
        dataEmissao: "2026-03-26",
        urlDocumento: null,
      },
      expect.objectContaining({ chave: "b", deputadoId: 2 }),
    ]);
  });

  it("deixa de fora despesas de deputado não sincronizado e avisa quais", async () => {
    const deps = setup(leitura([despesa(1, "a"), despesa(9, "b"), despesa(9, "c")]));

    const result = await syncDespesas(deps, 2026);

    expect(result.status).toBe("falha_parcial");
    expect(result.gravados).toBe(1);
    expect(deps.despesas.substituirAno.mock.calls[0][1]).toHaveLength(1);
    expect(deps.ingestao.finish).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ erro: "2 despesa(s) de deputado(s) não sincronizado(s): 9; rode sync-deputados" }),
    );
  });

  it("marca falha parcial quando o arquivo tem linhas inválidas", async () => {
    // 2 inválidas em ~300 linhas: abaixo do limite de 1%, então o ano é gravado com aviso.
    const validas = Array.from({ length: 300 }, (_, i) => despesa(1, `a${i}`));
    const deps = setup(leitura(validas, { invalidas: 2, primeiroErro: "Valor monetário inválido" }));

    const result = await syncDespesas(deps, 2026);

    expect(result.status).toBe("falha_parcial");
    expect(deps.ingestao.finish).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ erro: expect.stringContaining("2 linha(s) inválida(s). Primeiro erro: Valor monetário inválido") }),
    );
  });

  it("trata linha de outro ano como inválida (o ano é substituído por inteiro)", async () => {
    const deps = setup(leitura([...Array.from({ length: 200 }, (_, i) => despesa(1, `a${i}`)), { ...despesa(1, "x"), ano: 2025 }]));

    const result = await syncDespesas(deps, 2026);

    expect(result.status).toBe("falha_parcial");
    expect(deps.despesas.substituirAno.mock.calls[0][1]).toHaveLength(200);
    expect(deps.ingestao.finish).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ erro: expect.stringContaining("1 linha(s) de outro ano") }),
    );
  });

  it("avisa linhas duplicadas descartadas", async () => {
    const deps = setup(leitura(Array.from({ length: 200 }, (_, i) => despesa(1, `a${i}`)), { duplicadas: 1 }));

    const result = await syncDespesas(deps, 2026);

    expect(result.status).toBe("falha_parcial");
    expect(deps.ingestao.finish).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ erro: expect.stringContaining("1 linha(s) duplicada(s)") }),
    );
  });

  it("não substitui o ano quando mais de 1% das linhas foi descartada (formato mudou?)", async () => {
    const deps = setup(leitura([despesa(1, "a"), despesa(1, "b")], { invalidas: 5, primeiroErro: "Campo vlrLiquido inválido" }));

    const result = await syncDespesas(deps, 2026);

    expect(result.status).toBe("falha");
    expect(deps.despesas.substituirAno).not.toHaveBeenCalled();
  });

  it("não substitui o ano quando o arquivo tem bem menos linhas que o já gravado (arquivo truncado?)", async () => {
    const deps = setup(leitura([despesa(1, "a"), despesa(1, "b")]));
    deps.despesas.contarAno.mockResolvedValue(100);

    const result = await syncDespesas(deps, 2026);

    expect(result.status).toBe("falha");
    expect(deps.despesas.substituirAno).not.toHaveBeenCalled();
    expect(deps.ingestao.finish).toHaveBeenCalledWith(3, expect.objectContaining({ erro: expect.stringMatching(/truncado/) }));
  });

  it("não apaga o ano quando o arquivo vem sem despesas", async () => {
    const deps = setup(leitura([]));

    const result = await syncDespesas(deps, 2026);

    expect(result.status).toBe("falha");
    expect(deps.despesas.substituirAno).not.toHaveBeenCalled();
  });

  it("não apaga o ano quando nenhum deputado do arquivo está sincronizado", async () => {
    const deps = setup(leitura([despesa(9, "a")]), []);

    const result = await syncDespesas(deps, 2026);

    expect(result.status).toBe("falha");
    expect(deps.despesas.substituirAno).not.toHaveBeenCalled();
  });

  it("registra falha quando o download falha", async () => {
    const deps = setup(new Error("Download respondeu 503"));

    const result = await syncDespesas(deps, 2026);

    expect(result.status).toBe("falha");
    expect(deps.ingestao.finish).toHaveBeenCalledWith(3, expect.objectContaining({ erro: "Download respondeu 503" }));
  });

  it("registra o início com o nome do job", async () => {
    const deps = setup(leitura([despesa(1, "a")]));

    await syncDespesas(deps, 2026);

    expect(deps.ingestao.start).toHaveBeenCalledWith("sync-despesas", AGORA);
  });
});

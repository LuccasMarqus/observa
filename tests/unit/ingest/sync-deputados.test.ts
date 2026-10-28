import { describe, expect, it, vi } from "vitest";
import {
  syncDeputados,
  type DeputadoRow,
  type MandatoRow,
  type SyncDeputadosDeps,
} from "@/src/ingest/sync-deputados";
import type { DeputadoDetalhe, DeputadoResumo } from "@/src/sources/camara/schemas";

const AGORA = new Date("2026-10-27T12:00:00Z");

function resumo(id: number, siglaPartido = "PT", siglaUf = "MG"): DeputadoResumo {
  return { id, nome: `Dep ${id}`, siglaPartido, siglaUf, idLegislatura: 57, urlFoto: null, email: null };
}

function detalhe(id: number, idLegislaturaStatus = 57): DeputadoDetalhe {
  return {
    id,
    nomeCivil: `NOME CIVIL ${id}`,
    ultimoStatus: {
      nome: `Dep ${id}`,
      nomeEleitoral: `Dep ${id}`,
      siglaPartido: "PSD",
      siglaUf: "MG",
      idLegislatura: idLegislaturaStatus,
      urlFoto: `https://www.camara.leg.br/internet/deputado/bandep/${id}.jpg`,
      data: "2023-02-01",
      situacao: "Exercício",
      condicaoEleitoral: "Titular",
    },
    sexo: "F",
    dataNascimento: "1980-01-01",
    ufNascimento: "MG",
    municipioNascimento: "Belo Horizonte",
    escolaridade: "Superior",
  };
}

function setup(overrides: Partial<SyncDeputadosDeps["client"]> = {}) {
  const deps = {
    client: {
      listLegislaturas: vi.fn(async () => [{ id: 57, dataInicio: "2023-02-01", dataFim: "2027-01-31" }]),
      listDeputados: vi.fn(async () => [resumo(1), resumo(2)]),
      getDeputado: vi.fn(async (id: number) => detalhe(id)),
      ...overrides,
    },
    deputados: {
      upsertLegislaturas: vi.fn(async () => {}),
      upsertDeputadoComMandato: vi.fn<(deputado: DeputadoRow, mandato: MandatoRow) => Promise<void>>(async () => {}),
    },
    ingestao: {
      start: vi.fn(async () => 42),
      finish: vi.fn(async () => {}),
    },
    now: () => AGORA,
  } satisfies SyncDeputadosDeps;
  return deps;
}

describe("syncDeputados", () => {
  it("grava cada deputado com o mandato da legislatura pedida", async () => {
    const deps = setup();

    const result = await syncDeputados(deps, 57);

    expect(result).toEqual({ status: "sucesso", lidos: 2, gravados: 2, falhas: [] });
    expect(deps.deputados.upsertDeputadoComMandato).toHaveBeenCalledWith(
      {
        id: 1,
        nomeCivil: "NOME CIVIL 1",
        nomeEleitoral: "Dep 1",
        sexo: "F",
        dataNascimento: "1980-01-01",
        ufNascimento: "MG",
        municipioNascimento: "Belo Horizonte",
        escolaridade: "Superior",
        urlFoto: "https://www.camara.leg.br/internet/deputado/bandep/1.jpg",
        atualizadoEm: AGORA,
      },
      {
        deputadoId: 1,
        legislaturaId: 57,
        siglaPartido: "PSD",
        siglaUf: "MG",
        situacao: "Exercício",
        condicaoEleitoral: "Titular",
      },
    );
  });

  it("usa o partido do último status quando ele é da legislatura (reflete troca de partido)", async () => {
    // A lista da legislatura traz uma linha por partido; o último status traz o atual.
    const deps = setup({ listDeputados: vi.fn(async () => [resumo(1, "REPUBLICANOS", "AM")]) });

    await syncDeputados(deps, 57);

    const [, mandato] = deps.deputados.upsertDeputadoComMandato.mock.calls[0];
    expect(mandato).toMatchObject({ siglaPartido: "PSD", siglaUf: "MG" });
  });

  it("usa partido e UF da lista quando o último status é de outra legislatura", async () => {
    const deps = setup({ getDeputado: vi.fn(async (id: number) => detalhe(id, 58)) });

    await syncDeputados(deps, 57);

    const [, mandato] = deps.deputados.upsertDeputadoComMandato.mock.calls[0];
    expect(mandato).toMatchObject({ siglaPartido: "PT", siglaUf: "MG" });
  });

  it("deixa situação nula quando o último status é de outra legislatura", async () => {
    const deps = setup({ getDeputado: vi.fn(async (id: number) => detalhe(id, 58)) });

    await syncDeputados(deps, 57);

    const [, mandato] = deps.deputados.upsertDeputadoComMandato.mock.calls[0];
    expect(mandato).toMatchObject({ situacao: null, condicaoEleitoral: null });
  });

  it("grava cada deputado uma só vez mesmo se a lista repetir o id", async () => {
    const deps = setup({ listDeputados: vi.fn(async () => [resumo(1), resumo(1, "PL"), resumo(2)]) });

    const result = await syncDeputados(deps, 57);

    expect(result.lidos).toBe(2);
    expect(deps.client.getDeputado).toHaveBeenCalledTimes(2);
  });

  it("deixa o partido nulo (ambíguo) quando a lista tem vários e o status é de outra legislatura", async () => {
    // Sem ordem garantida na lista, escolher um partido seria arbitrário e mudaria entre execuções.
    const deps = setup({
      listDeputados: vi.fn(async () => [resumo(1, "PL", "SP"), resumo(1, "PT", "SP")]),
      getDeputado: vi.fn(async (id: number) => detalhe(id, 58)),
    });

    await syncDeputados(deps, 57);

    const [, mandato] = deps.deputados.upsertDeputadoComMandato.mock.calls[0];
    expect(mandato).toMatchObject({ siglaPartido: null, siglaUf: "SP" });
  });

  it("interrompe após 10 falhas seguidas (API fora do ar) em vez de tentar todos", async () => {
    const lista = Array.from({ length: 30 }, (_, i) => resumo(i + 1));
    const deps = setup({
      listDeputados: vi.fn(async () => lista),
      getDeputado: vi.fn(async () => Promise.reject(new Error("API fora do ar"))),
    });

    const result = await syncDeputados(deps, 57);

    expect(deps.client.getDeputado).toHaveBeenCalledTimes(10);
    expect(result.status).toBe("falha");
    expect(deps.ingestao.finish).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ erro: expect.stringContaining("10 falhas seguidas") }),
    );
  });

  it("um sucesso no meio zera a contagem de falhas seguidas", async () => {
    const lista = Array.from({ length: 20 }, (_, i) => resumo(i + 1));
    const deps = setup({
      listDeputados: vi.fn(async () => lista),
      getDeputado: vi.fn(async (id: number) => {
        if (id === 9) return detalhe(id);
        throw new Error("instável");
      }),
    });

    await syncDeputados(deps, 57);

    expect(deps.client.getDeputado).toHaveBeenCalledTimes(19);
  });

  it("trata lista vazia da API como falha, não como sucesso", async () => {
    const deps = setup({ listDeputados: vi.fn(async () => []) });

    const result = await syncDeputados(deps, 57);

    expect(result.status).toBe("falha");
    expect(deps.ingestao.finish).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ erro: "A API não retornou deputados para a legislatura 57" }),
    );
  });

  it("propaga erro ao registrar o fim sem reclassificar dados já gravados como falha", async () => {
    const deps = setup();
    deps.ingestao.finish.mockRejectedValueOnce(new Error("conexão caiu"));

    await expect(syncDeputados(deps, 57)).rejects.toThrow("conexão caiu");
    expect(deps.ingestao.finish).toHaveBeenCalledTimes(1);
  });

  it("grava as legislaturas antes dos mandatos", async () => {
    const deps = setup();

    await syncDeputados(deps, 57);

    expect(deps.deputados.upsertLegislaturas).toHaveBeenCalledWith([
      { id: 57, dataInicio: "2023-02-01", dataFim: "2027-01-31" },
    ]);
    expect(deps.deputados.upsertLegislaturas.mock.invocationCallOrder[0]).toBeLessThan(
      deps.deputados.upsertDeputadoComMandato.mock.invocationCallOrder[0],
    );
  });

  it("registra falha parcial e segue quando um deputado falha", async () => {
    const deps = setup({
      getDeputado: vi.fn(async (id: number) => {
        if (id === 1) throw new Error("API fora do ar");
        return detalhe(id);
      }),
    });

    const result = await syncDeputados(deps, 57);

    expect(result).toEqual({
      status: "falha_parcial",
      lidos: 2,
      gravados: 1,
      falhas: [{ id: 1, erro: "API fora do ar" }],
    });
    expect(deps.ingestao.finish).toHaveBeenCalledWith(42, {
      status: "falha_parcial",
      registrosLidos: 2,
      registrosGravados: 1,
      erro: "1 deputado(s) com erro: 1. Primeiro erro: API fora do ar",
    });
  });

  it("registra falha total quando a lista não pode ser lida", async () => {
    const deps = setup({ listDeputados: vi.fn(async () => Promise.reject(new Error("timeout"))) });

    const result = await syncDeputados(deps, 57);

    expect(result.status).toBe("falha");
    expect(deps.deputados.upsertDeputadoComMandato).not.toHaveBeenCalled();
    expect(deps.ingestao.finish).toHaveBeenCalledWith(42, {
      status: "falha",
      registrosLidos: 0,
      registrosGravados: 0,
      erro: "timeout",
    });
  });

  it("falha se a legislatura pedida não existe na API", async () => {
    const deps = setup();

    const result = await syncDeputados(deps, 99);

    expect(result.status).toBe("falha");
    expect(deps.ingestao.finish).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ erro: "Legislatura 99 não encontrada na API da Câmara" }),
    );
  });

  it("marca falha quando nenhum deputado foi gravado", async () => {
    const deps = setup({ getDeputado: vi.fn(async () => Promise.reject(new Error("x"))) });

    const result = await syncDeputados(deps, 57);

    expect(result.status).toBe("falha");
  });

  it("registra o início da execução com o nome do job", async () => {
    const deps = setup();

    await syncDeputados(deps, 57);

    expect(deps.ingestao.start).toHaveBeenCalledWith("sync-deputados", AGORA);
  });
});

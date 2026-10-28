import { describe, expect, it, vi } from "vitest";
import {
  syncVotacoes,
  type OrientacaoRow,
  type SyncVotacoesDeps,
  type VotacaoRow,
  type VotoRow,
} from "@/src/ingest/sync-votacoes";
import type { Orientacao, VotacaoResumo, Voto } from "@/src/sources/camara/schemas";

const AGORA = new Date("2026-10-27T12:00:00Z");
const PERIODO = { dataInicio: "2026-10-01", dataFim: "2026-10-20" };

function votacao(id: string): VotacaoResumo {
  return {
    id,
    data: "2026-10-14",
    dataHoraRegistro: "2026-10-14T20:56:14",
    siglaOrgao: "PLEN",
    descricao: `Votação ${id}`,
    aprovacao: 0,
  };
}

function voto(idDeputado: number, tipoVoto = "Sim"): Voto {
  return { tipoVoto, dataRegistroVoto: "2026-10-14T20:52:43", idDeputado, siglaPartido: "PT", siglaUf: "MG" };
}

function orientacao(siglaBancada: string, valor: string | null = "Sim"): Orientacao {
  return { siglaBancada, tipoLideranca: "P", orientacao: valor };
}

type Gravar = (v: VotacaoRow, votos: readonly VotoRow[], orientacoes: readonly OrientacaoRow[]) => Promise<void>;

function setup(overrides: Partial<SyncVotacoesDeps["client"]> = {}) {
  return {
    client: {
      listVotacoesPlenario: vi.fn(async () => [votacao("1-1"), votacao("2-2")]),
      getVotos: vi.fn(async (): Promise<Voto[]> => [voto(10), voto(11, "Não")]),
      getOrientacoes: vi.fn(async (): Promise<Orientacao[]> => [orientacao("PT"), orientacao("Governo", null)]),
      ...overrides,
    },
    votacoes: { gravarVotacao: vi.fn<Gravar>(async () => {}) },
    ingestao: { start: vi.fn(async () => 7), finish: vi.fn(async () => {}) },
    now: () => AGORA,
  } satisfies SyncVotacoesDeps;
}

describe("syncVotacoes", () => {
  it("grava votação nominal com votos e orientações", async () => {
    const deps = setup();

    const result = await syncVotacoes(deps, PERIODO);

    expect(result).toEqual({ status: "sucesso", lidos: 2, gravados: 2, falhas: [] });
    expect(deps.client.listVotacoesPlenario).toHaveBeenCalledWith(PERIODO);
    expect(deps.votacoes.gravarVotacao).toHaveBeenCalledWith(
      {
        id: "1-1",
        data: "2026-10-14",
        dataHoraRegistro: "2026-10-14T20:56:14",
        siglaOrgao: "PLEN",
        descricao: "Votação 1-1",
        aprovacao: 0,
        nominal: true,
        atualizadoEm: AGORA,
      },
      [
        { votacaoId: "1-1", deputadoId: 10, tipoVoto: "Sim", siglaPartido: "PT", siglaUf: "MG", dataRegistro: "2026-10-14T20:52:43" },
        { votacaoId: "1-1", deputadoId: 11, tipoVoto: "Não", siglaPartido: "PT", siglaUf: "MG", dataRegistro: "2026-10-14T20:52:43" },
      ],
      [
        { votacaoId: "1-1", siglaBancada: "PT", tipoLideranca: "P", orientacao: "Sim" },
        { votacaoId: "1-1", siglaBancada: "Governo", tipoLideranca: "P", orientacao: null },
      ],
    );
  });

  it("grava votação simbólica sem votos e sem buscar orientações", async () => {
    const deps = setup({ getVotos: vi.fn(async (): Promise<Voto[]> => []) });

    await syncVotacoes(deps, PERIODO);

    const [row, votos, orientacoes] = deps.votacoes.gravarVotacao.mock.calls[0];
    expect(row.nominal).toBe(false);
    expect(votos).toEqual([]);
    expect(orientacoes).toEqual([]);
    expect(deps.client.getOrientacoes).not.toHaveBeenCalled();
  });

  it("não duplica voto do mesmo deputado nem orientação da mesma bancada", async () => {
    const deps = setup({
      getVotos: vi.fn(async () => [voto(10), voto(10, "Não")]),
      getOrientacoes: vi.fn(async () => [orientacao("PT"), orientacao("PT", "Não")]),
    });

    await syncVotacoes(deps, PERIODO);

    const [, votos, orientacoes] = deps.votacoes.gravarVotacao.mock.calls[0];
    expect(votos).toHaveLength(1);
    expect(orientacoes).toHaveLength(1);
  });

  it("mantém orientações de partido e de bloco com a mesma sigla", async () => {
    const deps = setup({
      getOrientacoes: vi.fn(async () => [orientacao("PSD"), { siglaBancada: "PSD", tipoLideranca: "B", orientacao: "Não" }]),
    });

    await syncVotacoes(deps, PERIODO);

    const [, , orientacoes] = deps.votacoes.gravarVotacao.mock.calls[0];
    expect(orientacoes).toHaveLength(2);
  });

  it("processa uma vez a votação que aparece repetida na lista (borda entre janelas)", async () => {
    const deps = setup({ listVotacoesPlenario: vi.fn(async () => [votacao("1-1"), votacao("1-1"), votacao("2-2")]) });

    const result = await syncVotacoes(deps, PERIODO);

    expect(result.lidos).toBe(2);
    expect(deps.client.getVotos).toHaveBeenCalledTimes(2);
  });

  it("período sem votações (recesso) é sucesso com zero lidos", async () => {
    const deps = setup({ listVotacoesPlenario: vi.fn(async () => []) });

    const result = await syncVotacoes(deps, PERIODO);

    expect(result).toEqual({ status: "sucesso", lidos: 0, gravados: 0, falhas: [] });
  });

  it("registra falha parcial com a mensagem da votação que falhou", async () => {
    const deps = setup({
      getVotos: vi.fn(async (id: string) => {
        if (id === "1-1") throw new Error("deputado 10 não sincronizado");
        return [voto(10)];
      }),
    });

    const result = await syncVotacoes(deps, PERIODO);

    expect(result.status).toBe("falha_parcial");
    expect(deps.ingestao.finish).toHaveBeenCalledWith(7, {
      status: "falha_parcial",
      registrosLidos: 2,
      registrosGravados: 1,
      erro: "1 votação(ões) com erro: 1-1. Primeiro erro: deputado 10 não sincronizado",
    });
  });

  it("registra falha total quando a lista de votações não pode ser lida", async () => {
    const deps = setup({ listVotacoesPlenario: vi.fn(async () => Promise.reject(new Error("Data inválida"))) });

    const result = await syncVotacoes(deps, PERIODO);

    expect(result.status).toBe("falha");
    expect(deps.ingestao.finish).toHaveBeenCalledWith(7, expect.objectContaining({ erro: "Data inválida" }));
  });

  it("para após 10 falhas seguidas", async () => {
    const lista = Array.from({ length: 25 }, (_, i) => votacao(`${i}-0`));
    const deps = setup({
      listVotacoesPlenario: vi.fn(async () => lista),
      getVotos: vi.fn(async () => Promise.reject(new Error("fora do ar"))),
    });

    await syncVotacoes(deps, PERIODO);

    expect(deps.client.getVotos).toHaveBeenCalledTimes(10);
  });

  it("registra o início com o nome do job", async () => {
    const deps = setup();

    await syncVotacoes(deps, PERIODO);

    expect(deps.ingestao.start).toHaveBeenCalledWith("sync-votacoes", AGORA);
  });
});

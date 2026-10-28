import { describe, expect, it, vi } from "vitest";
import { syncProposicoes, type ProposicaoRow, type SyncProposicoesDeps } from "@/src/ingest/sync-proposicoes";
import type { ProposicaoResumo } from "@/src/sources/camara/schemas";

const AGORA = new Date("2026-10-27T12:00:00Z");
const LEGISLATURA_57 = { dataInicio: "2023-02-01", dataFim: "2027-01-31" };

function proposicao(id: number, dataApresentacao: string | null, siglaTipo = "PL"): ProposicaoResumo {
  return { id, siglaTipo, numero: id, ano: 2024, ementa: `Ementa ${id}`, dataApresentacao };
}

type Gravar = (deputadoId: number, rows: readonly ProposicaoRow[]) => Promise<void>;

function setup(overrides: Partial<SyncProposicoesDeps["proposicoes"]> = {}, listar?: SyncProposicoesDeps["client"]["listProposicoesPorAutor"]) {
  return {
    client: {
      listProposicoesPorAutor: vi.fn(
        listar ??
          (async () => [
            proposicao(1, "2024-05-10T10:00"),
            proposicao(2, "2019-04-24T11:30"),
            proposicao(3, null),
          ]),
      ),
    },
    proposicoes: {
      legislatura: vi.fn(async () => LEGISLATURA_57),
      deputadosDaLegislatura: vi.fn(async () => [10, 11]),
      gravarAutorias: vi.fn<Gravar>(async () => {}),
      ...overrides,
    },
    ingestao: { start: vi.fn(async () => 5), finish: vi.fn(async () => {}) },
    now: () => AGORA,
  } satisfies SyncProposicoesDeps;
}

describe("syncProposicoes", () => {
  it("grava só as proposições apresentadas durante a legislatura", async () => {
    const deps = setup();

    const result = await syncProposicoes(deps, 57);

    expect(result).toEqual({ status: "sucesso", lidos: 2, gravados: 2, falhas: [] });
    expect(deps.client.listProposicoesPorAutor).toHaveBeenCalledWith(10, ["PL", "PEC", "PLP"]);
    expect(deps.proposicoes.gravarAutorias).toHaveBeenCalledWith(10, [
      {
        id: 1,
        siglaTipo: "PL",
        numero: 1,
        ano: 2024,
        ementa: "Ementa 1",
        dataApresentacao: "2024-05-10T10:00",
        atualizadoEm: AGORA,
      },
    ]);
  });

  it("inclui as datas de início e fim da legislatura", async () => {
    const deps = setup({}, async () => [proposicao(1, "2023-02-01T09:00"), proposicao(2, "2027-01-31T18:00")]);

    await syncProposicoes(deps, 57);

    expect(deps.proposicoes.gravarAutorias).toHaveBeenCalledWith(10, [
      expect.objectContaining({ id: 1 }),
      expect.objectContaining({ id: 2 }),
    ]);
  });

  it("grava uma vez a proposição repetida na paginação", async () => {
    const deps = setup({}, async () => [proposicao(1, "2024-05-10T10:00"), proposicao(1, "2024-05-10T10:00")]);

    await syncProposicoes(deps, 57);

    expect(deps.proposicoes.gravarAutorias).toHaveBeenCalledWith(10, [expect.objectContaining({ id: 1 })]);
  });

  it("falha orientando o operador quando a legislatura não foi sincronizada", async () => {
    const deps = setup({ legislatura: vi.fn(async () => null) });

    const result = await syncProposicoes(deps, 58);

    expect(result.status).toBe("falha");
    expect(deps.ingestao.finish).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ erro: "Legislatura 58 não sincronizada; rode sync-deputados -- 58 antes" }),
    );
  });

  it("falha quando a legislatura não tem deputados sincronizados", async () => {
    const deps = setup({ deputadosDaLegislatura: vi.fn(async () => []) });

    const result = await syncProposicoes(deps, 57);

    expect(result.status).toBe("falha");
  });

  it("registra falha parcial quando um deputado falha", async () => {
    const deps = setup({}, async (id) => {
      if (id === 10) throw new Error("API fora do ar");
      return [];
    });

    const result = await syncProposicoes(deps, 57);

    expect(result).toMatchObject({ status: "falha_parcial", gravados: 1, falhas: [{ id: 10, erro: "API fora do ar" }] });
  });

  it("registra o início com o nome do job", async () => {
    const deps = setup();

    await syncProposicoes(deps, 57);

    expect(deps.ingestao.start).toHaveBeenCalledWith("sync-proposicoes", AGORA);
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb, type Database } from "@/db/client";
import { deputado, orientacao, votacao, voto } from "@/db/schema";
import { createVotacoesRepository } from "@/src/repositories/votacoes";
import type { OrientacaoRow, VotacaoRow, VotoRow } from "@/src/ingest/sync-votacoes";
import { parseServerEnv } from "@/src/config/env";
import { ErroDeDado } from "@/src/ingest/lote";

// Ids exclusivos deste arquivo (prefixo "teste-" e faixa 9901xx); a limpeza não toca em outros dados.
const VOTACAO_ID = "teste-1";
const DEPUTADOS = [990101, 990102];
const AGORA = new Date("2026-10-27T12:00:00Z");

let database: Database | undefined;

function getDb(): Database["db"] {
  if (!database) throw new Error("Banco de teste não inicializado");
  return database.db;
}

function votacaoRow(overrides: Partial<VotacaoRow> = {}): VotacaoRow {
  return {
    id: VOTACAO_ID,
    data: "2026-10-14",
    dataHoraRegistro: "2026-10-14T20:56:14",
    siglaOrgao: "PLEN",
    descricao: "Teste",
    aprovacao: 1,
    nominal: true,
    atualizadoEm: AGORA,
    ...overrides,
  };
}

function votoRow(deputadoId: number, tipoVoto = "Sim"): VotoRow {
  return { votacaoId: VOTACAO_ID, deputadoId, tipoVoto, siglaPartido: "PT", siglaUf: "MG", dataRegistro: "2026-10-14T20:52:43" };
}

function orientacaoRow(siglaBancada: string, valor: string | null = "Sim"): OrientacaoRow {
  return { votacaoId: VOTACAO_ID, siglaBancada, tipoLideranca: "P", orientacao: valor };
}

async function limpar(): Promise<void> {
  const db = getDb();
  await db.delete(voto).where(like(voto.votacaoId, "teste-%"));
  await db.delete(orientacao).where(like(orientacao.votacaoId, "teste-%"));
  await db.delete(votacao).where(like(votacao.id, "teste-%"));
  await db.delete(deputado).where(inArray(deputado.id, DEPUTADOS));
}

beforeAll(async () => {
  const { DATABASE_URL } = parseServerEnv(process.env);
  database = createDb(DATABASE_URL);
  await migrate(database.db, { migrationsFolder: "db/migrations" });
});

beforeEach(async () => {
  await limpar();
  await getDb()
    .insert(deputado)
    .values(DEPUTADOS.map((id) => ({ id, nomeCivil: `TESTE ${id}`, nomeEleitoral: `Teste ${id}`, atualizadoEm: AGORA })));
});

afterAll(async () => {
  if (database) await limpar();
  await database?.close();
});

describe("repositório de votações", () => {
  it("grava votação nominal com votos e orientações", async () => {
    const repo = createVotacoesRepository(getDb());

    await repo.gravarVotacao(votacaoRow(), [votoRow(990101), votoRow(990102, "Não")], [orientacaoRow("PT")]);

    const [v] = await getDb().select().from(votacao).where(eq(votacao.id, VOTACAO_ID));
    const votos = await getDb().select().from(voto).where(eq(voto.votacaoId, VOTACAO_ID));
    const orientacoes = await getDb().select().from(orientacao).where(eq(orientacao.votacaoId, VOTACAO_ID));
    expect(v).toMatchObject({ nominal: true, dataHoraRegistro: "2026-10-14 20:56:14" });
    expect(votos.map((x) => [x.deputadoId, x.tipoVoto]).sort()).toEqual([
      [990101, "Sim"],
      [990102, "Não"],
    ]);
    expect(orientacoes).toEqual([orientacaoRow("PT")]);
  });

  it("rodar de novo substitui votos e orientações sem duplicar", async () => {
    const repo = createVotacoesRepository(getDb());
    await repo.gravarVotacao(votacaoRow(), [votoRow(990101), votoRow(990102)], [orientacaoRow("PT"), orientacaoRow("PL")]);

    await repo.gravarVotacao(votacaoRow({ aprovacao: 0 }), [votoRow(990101, "Não")], [orientacaoRow("PT", "Não")]);

    const [v] = await getDb().select().from(votacao).where(eq(votacao.id, VOTACAO_ID));
    const votos = await getDb().select().from(voto).where(eq(voto.votacaoId, VOTACAO_ID));
    const orientacoes = await getDb().select().from(orientacao).where(eq(orientacao.votacaoId, VOTACAO_ID));
    expect(v.aprovacao).toBe(0);
    expect(votos).toEqual([{ ...votoRow(990101, "Não"), dataRegistro: "2026-10-14 20:52:43" }]);
    expect(orientacoes).toEqual([orientacaoRow("PT", "Não")]);
  });

  it("grava votos de votação secreta sem o tipo do voto", async () => {
    const repo = createVotacoesRepository(getDb());

    await repo.gravarVotacao(votacaoRow(), [{ ...votoRow(990101), tipoVoto: null }], []);

    const votos = await getDb().select().from(voto).where(eq(voto.votacaoId, VOTACAO_ID));
    expect(votos).toEqual([expect.objectContaining({ deputadoId: 990101, tipoVoto: null })]);
  });

  it("grava votação simbólica sem votos", async () => {
    const repo = createVotacoesRepository(getDb());

    await repo.gravarVotacao(votacaoRow({ nominal: false }), [], []);

    const [v] = await getDb().select().from(votacao).where(eq(votacao.id, VOTACAO_ID));
    expect(v.nominal).toBe(false);
  });

  it("voto de deputado não sincronizado falha como erro de dado, listando os ids, e não grava nada", async () => {
    const repo = createVotacoesRepository(getDb());

    const error = await repo.gravarVotacao(votacaoRow(), [votoRow(990101), votoRow(990199)], []).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ErroDeDado);
    expect(String(error)).toMatch(/deputado\(s\) não sincronizado\(s\): 990199.*sync-deputados/);
    const votacoes = await getDb().select().from(votacao).where(eq(votacao.id, VOTACAO_ID));
    expect(votacoes).toEqual([]);
  });

  it("recusa transformar votação nominal em simbólica e mantém os votos (resposta vazia da API)", async () => {
    const repo = createVotacoesRepository(getDb());
    await repo.gravarVotacao(votacaoRow(), [votoRow(990101)], [orientacaoRow("PT")]);

    await expect(repo.gravarVotacao(votacaoRow({ nominal: false }), [], [])).rejects.toThrow(/sem votos/);

    const [v] = await getDb().select().from(votacao).where(eq(votacao.id, VOTACAO_ID));
    const votos = await getDb().select().from(voto).where(eq(voto.votacaoId, VOTACAO_ID));
    expect(v.nominal).toBe(true);
    expect(votos).toHaveLength(1);
  });

  it("guarda orientação de partido e de bloco com a mesma sigla", async () => {
    const repo = createVotacoesRepository(getDb());

    await repo.gravarVotacao(votacaoRow(), [votoRow(990101)], [
      orientacaoRow("PSD"),
      { ...orientacaoRow("PSD", "Não"), tipoLideranca: "B" },
    ]);

    const orientacoes = await getDb().select().from(orientacao).where(eq(orientacao.votacaoId, VOTACAO_ID));
    expect(orientacoes).toHaveLength(2);
  });
});

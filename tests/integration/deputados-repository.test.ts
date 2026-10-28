import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb, type Database } from "@/db/client";
import { deputado, ingestaoExecucao, legislatura, mandato } from "@/db/schema";
import { createDeputadosRepository, createIngestaoLog } from "@/src/repositories/deputados";
import type { DeputadoRow, MandatoRow } from "@/src/ingest/sync-deputados";
import { parseServerEnv } from "@/src/config/env";

// Ids exclusivos deste arquivo; a limpeza não toca em outros dados.
const LEGISLATURAS = [901, 902];
const DEPUTADOS = [990001];
const JOB = "teste-integracao";

let database: Database | undefined;

function getDb(): Database["db"] {
  if (!database) throw new Error("Banco de teste não inicializado");
  return database.db;
}

function deputadoRow(overrides: Partial<DeputadoRow> = {}): DeputadoRow {
  return {
    id: 990001,
    nomeCivil: "FULANA DE TAL",
    nomeEleitoral: "Fulana",
    sexo: "F",
    dataNascimento: "1980-01-01",
    ufNascimento: "MG",
    municipioNascimento: "Belo Horizonte",
    escolaridade: "Superior",
    urlFoto: null,
    atualizadoEm: new Date("2026-10-27T12:00:00Z"),
    ...overrides,
  };
}

function mandatoRow(overrides: Partial<MandatoRow> = {}): MandatoRow {
  return {
    deputadoId: 990001,
    legislaturaId: 901,
    siglaPartido: "PT",
    siglaUf: "MG",
    situacao: "Exercício",
    condicaoEleitoral: "Titular",
    ...overrides,
  };
}

async function limpar(): Promise<void> {
  const db = getDb();
  await db.delete(mandato).where(inArray(mandato.deputadoId, DEPUTADOS));
  await db.delete(deputado).where(inArray(deputado.id, DEPUTADOS));
  await db.delete(legislatura).where(inArray(legislatura.id, LEGISLATURAS));
  await db.delete(ingestaoExecucao).where(eq(ingestaoExecucao.job, JOB));
}

beforeAll(async () => {
  const { DATABASE_URL } = parseServerEnv(process.env);
  database = createDb(DATABASE_URL);
  await migrate(database.db, { migrationsFolder: "db/migrations" });
});

beforeEach(limpar);

afterAll(async () => {
  if (database) await limpar();
  await database?.close();
});

describe("repositório de deputados", () => {
  it("upsert de legislaturas é idempotente e atualiza datas", async () => {
    const repo = createDeputadosRepository(getDb());

    await repo.upsertLegislaturas([{ id: 901, dataInicio: "2023-02-01", dataFim: "2027-01-31" }]);
    await repo.upsertLegislaturas([{ id: 901, dataInicio: "2023-02-01", dataFim: "2027-02-01" }]);

    const rows = await getDb().select().from(legislatura).where(eq(legislatura.id, 901));
    expect(rows).toEqual([{ id: 901, dataInicio: "2023-02-01", dataFim: "2027-02-01" }]);
  });

  it("aceita lista vazia de legislaturas", async () => {
    const repo = createDeputadosRepository(getDb());

    await expect(repo.upsertLegislaturas([])).resolves.toBeUndefined();
  });

  it("rodar duas vezes não duplica deputado nem mandato e atualiza o partido", async () => {
    const repo = createDeputadosRepository(getDb());
    await repo.upsertLegislaturas([{ id: 901, dataInicio: "2023-02-01", dataFim: "2027-01-31" }]);

    await repo.upsertDeputadoComMandato(deputadoRow(), mandatoRow());
    await repo.upsertDeputadoComMandato(
      deputadoRow({ atualizadoEm: new Date("2026-10-28T12:00:00Z") }),
      mandatoRow({ siglaPartido: "PSB" }),
    );

    const deputados = await getDb().select().from(deputado).where(eq(deputado.id, 990001));
    const mandatos = await getDb().select().from(mandato).where(eq(mandato.deputadoId, 990001));
    expect(deputados).toHaveLength(1);
    expect(deputados[0].atualizadoEm).toEqual(new Date("2026-10-28T12:00:00Z"));
    expect(mandatos).toEqual([mandatoRow({ siglaPartido: "PSB" })]);
  });

  it("guarda um mandato por legislatura", async () => {
    const repo = createDeputadosRepository(getDb());
    await repo.upsertLegislaturas([
      { id: 901, dataInicio: "2019-02-01", dataFim: "2023-01-31" },
      { id: 902, dataInicio: "2023-02-01", dataFim: "2027-01-31" },
    ]);

    await repo.upsertDeputadoComMandato(deputadoRow(), mandatoRow({ legislaturaId: 901, siglaPartido: "PT" }));
    await repo.upsertDeputadoComMandato(deputadoRow(), mandatoRow({ legislaturaId: 902, siglaPartido: "PSB" }));

    const mandatos = await getDb().select().from(mandato).where(eq(mandato.deputadoId, 990001));
    expect(mandatos.map((m) => [m.legislaturaId, m.siglaPartido]).sort()).toEqual([
      [901, "PT"],
      [902, "PSB"],
    ]);
  });

  it("não grava o deputado se o mandato falhar (transação)", async () => {
    const repo = createDeputadosRepository(getDb());

    await expect(
      repo.upsertDeputadoComMandato(deputadoRow(), mandatoRow({ legislaturaId: 902 })),
    ).rejects.toThrow();

    const deputados = await getDb().select().from(deputado).where(eq(deputado.id, 990001));
    expect(deputados).toEqual([]);
  });
});

describe("log de ingestão", () => {
  it("registra início como rodando e fim com contagens", async () => {
    const log = createIngestaoLog(getDb(), () => new Date("2026-10-27T12:05:00Z"));

    const id = await log.start(JOB, new Date("2026-10-27T12:00:00Z"));
    const [rodando] = await getDb().select().from(ingestaoExecucao).where(eq(ingestaoExecucao.id, id));
    await log.finish(id, { status: "falha_parcial", registrosLidos: 10, registrosGravados: 9, erro: "1 erro" });
    const [fim] = await getDb().select().from(ingestaoExecucao).where(eq(ingestaoExecucao.id, id));

    expect(rodando).toMatchObject({ job: JOB, status: "rodando", finalizadoEm: null });
    expect(fim).toMatchObject({
      status: "falha_parcial",
      registrosLidos: 10,
      registrosGravados: 9,
      erro: "1 erro",
      finalizadoEm: new Date("2026-10-27T12:05:00Z"),
    });
  });
});

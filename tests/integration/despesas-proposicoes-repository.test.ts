import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb, type Database } from "@/db/client";
import { autoria, deputado, despesa, legislatura, mandato, proposicao } from "@/db/schema";
import { createDespesasRepository } from "@/src/repositories/despesas";
import { createProposicoesRepository } from "@/src/repositories/proposicoes";
import type { DespesaRow } from "@/src/ingest/sync-despesas";
import type { ProposicaoRow } from "@/src/ingest/sync-proposicoes";
import { parseServerEnv } from "@/src/config/env";

// Reservados para testes: ano 2099, legislatura 921, deputados 9902xx, proposições 9903xx.
const ANO = 2099;
const LEGISLATURA = 921;
const DEPUTADOS = [990201, 990202];
const PROPOSICOES = [990301, 990302];
const AGORA = new Date("2026-10-27T12:00:00Z");

let database: Database | undefined;

function getDb(): Database["db"] {
  if (!database) throw new Error("Banco de teste não inicializado");
  return database.db;
}

function despesaRow(chave: string, deputadoId = 990201, valorLiquidoCentavos = 1000): DespesaRow {
  return {
    chave,
    deputadoId,
    ano: ANO,
    mes: 1,
    categoria: "TELEFONIA",
    fornecedor: "OPERADORA",
    documentoFornecedor: null,
    valorLiquidoCentavos,
    dataEmissao: null,
    urlDocumento: null,
  };
}

function proposicaoRow(id: number, ementa = `Ementa ${id}`): ProposicaoRow {
  return { id, siglaTipo: "PL", numero: id, ano: 2099, ementa, dataApresentacao: "2099-03-01T10:00", atualizadoEm: AGORA };
}

async function limpar(): Promise<void> {
  const db = getDb();
  await db.delete(despesa).where(eq(despesa.ano, ANO));
  await db.delete(autoria).where(inArray(autoria.deputadoId, DEPUTADOS));
  await db.delete(proposicao).where(inArray(proposicao.id, PROPOSICOES));
  await db.delete(mandato).where(inArray(mandato.deputadoId, DEPUTADOS));
  await db.delete(deputado).where(inArray(deputado.id, DEPUTADOS));
  await db.delete(legislatura).where(eq(legislatura.id, LEGISLATURA));
}

beforeAll(async () => {
  const { DATABASE_URL } = parseServerEnv(process.env);
  database = createDb(DATABASE_URL);
  await migrate(database.db, { migrationsFolder: "db/migrations" });
});

beforeEach(async () => {
  await limpar();
  const db = getDb();
  await db.insert(legislatura).values({ id: LEGISLATURA, dataInicio: "2099-02-01", dataFim: "2103-01-31" });
  await db
    .insert(deputado)
    .values(DEPUTADOS.map((id) => ({ id, nomeCivil: `TESTE ${id}`, nomeEleitoral: `Teste ${id}`, atualizadoEm: AGORA })));
  await db.insert(mandato).values({ deputadoId: 990201, legislaturaId: LEGISLATURA, siglaUf: "MG" });
});

afterAll(async () => {
  if (database) await limpar();
  await database?.close();
});

describe("repositório de despesas", () => {
  it("diz quais deputados estão sincronizados", async () => {
    const repo = createDespesasRepository(getDb());

    const conhecidos = await repo.idsDeputadosConhecidos([990201, 990299]);

    expect([...conhecidos]).toEqual([990201]);
  });

  it("substituir o ano troca todas as despesas dele e mantém a soma exata", async () => {
    const repo = createDespesasRepository(getDb());
    await repo.substituirAno(ANO, [despesaRow("teste-a"), despesaRow("teste-b")]);

    await repo.substituirAno(ANO, [despesaRow("teste-b", 990201, 95430), despesaRow("teste-c", 990202, -339353)]);

    const rows = await getDb().select().from(despesa).where(eq(despesa.ano, ANO));
    expect(rows.map((r) => r.chave).sort()).toEqual(["teste-b", "teste-c"]);
    expect(rows.reduce((soma, r) => soma + r.valorLiquidoCentavos, 0)).toBe(95430 - 339353);
  });

  it("conta as despesas gravadas de um ano", async () => {
    const repo = createDespesasRepository(getDb());
    await repo.substituirAno(ANO, [despesaRow("teste-a"), despesaRow("teste-b")]);

    expect(await repo.contarAno(ANO)).toBe(2);
  });

  it("grava muitas despesas em lotes", async () => {
    const repo = createDespesasRepository(getDb());
    const muitas = Array.from({ length: 2_500 }, (_, i) => despesaRow(`teste-${i}`));

    await repo.substituirAno(ANO, muitas);

    const rows = await getDb().select({ chave: despesa.chave }).from(despesa).where(eq(despesa.ano, ANO));
    expect(rows).toHaveLength(2_500);
  });

  it("desfaz tudo se uma despesa falhar (não deixa o ano vazio)", async () => {
    const repo = createDespesasRepository(getDb());
    await repo.substituirAno(ANO, [despesaRow("teste-a")]);

    await expect(repo.substituirAno(ANO, [despesaRow("teste-x", 990299)])).rejects.toThrow();

    const rows = await getDb().select().from(despesa).where(eq(despesa.ano, ANO));
    expect(rows.map((r) => r.chave)).toEqual(["teste-a"]);
  });
});

describe("repositório de proposições", () => {
  it("lê o período da legislatura e seus deputados", async () => {
    const repo = createProposicoesRepository(getDb());

    expect(await repo.legislatura(LEGISLATURA)).toEqual({ dataInicio: "2099-02-01", dataFim: "2103-01-31" });
    expect(await repo.legislatura(929)).toBeNull();
    expect(await repo.deputadosDaLegislatura(LEGISLATURA)).toEqual([990201]);
  });

  it("grava proposições e autoria de forma idempotente, atualizando a ementa", async () => {
    const repo = createProposicoesRepository(getDb());

    await repo.gravarAutorias(990201, [proposicaoRow(990301), proposicaoRow(990302)]);
    await repo.gravarAutorias(990201, [proposicaoRow(990301, "Ementa nova")]);

    const proposicoes = await getDb().select().from(proposicao).where(inArray(proposicao.id, PROPOSICOES));
    const autorias = await getDb().select().from(autoria).where(eq(autoria.deputadoId, 990201));
    expect(proposicoes.find((p) => p.id === 990301)?.ementa).toBe("Ementa nova");
    expect(autorias).toHaveLength(2);
  });

  it("registra coautoria de dois deputados na mesma proposição", async () => {
    const repo = createProposicoesRepository(getDb());

    await repo.gravarAutorias(990201, [proposicaoRow(990301)]);
    await repo.gravarAutorias(990202, [proposicaoRow(990301)]);

    const autorias = await getDb().select().from(autoria).where(eq(autoria.proposicaoId, 990301));
    expect(autorias.map((a) => a.deputadoId).sort()).toEqual([990201, 990202]);
  });

  it("aceita deputado sem proposições", async () => {
    const repo = createProposicoesRepository(getDb());

    await expect(repo.gravarAutorias(990201, [])).resolves.toBeUndefined();
  });
});

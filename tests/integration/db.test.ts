import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb, type Database } from "@/db/client";
import { legislatura } from "@/db/schema";
import { parseServerEnv } from "@/src/config/env";

// Ids usados só por estes testes; a limpeza não toca em outros dados do banco.
// Faixa 9xx é reservada para testes; ids reais da Câmara (ex.: 57) podem ter dados do sync.
const TEST_IDS = [911, 919];
const CHECK_VIOLATION = "23514";

let database: Database | undefined;

function getDb(): Database["db"] {
  if (!database) throw new Error("Banco de teste não inicializado");
  return database.db;
}

beforeAll(async () => {
  const { DATABASE_URL } = parseServerEnv(process.env);
  database = createDb(DATABASE_URL);
  await migrate(database.db, { migrationsFolder: "db/migrations" });
});

beforeEach(async () => {
  await getDb().delete(legislatura).where(inArray(legislatura.id, TEST_IDS));
});

afterAll(async () => {
  await database?.close();
});

describe("banco de dados", () => {
  it("aplica as migrações e grava uma legislatura", async () => {
    await getDb().insert(legislatura).values({
      id: 911,
      dataInicio: "2023-02-01",
      dataFim: "2027-01-31",
    });

    const rows = await getDb().select().from(legislatura).where(eq(legislatura.id, 911));

    expect(rows).toEqual([{ id: 911, dataInicio: "2023-02-01", dataFim: "2027-01-31" }]);
  });

  it("recusa legislatura com data de fim antes do início", async () => {
    await expect(
      getDb().insert(legislatura).values({
        id: 919,
        dataInicio: "2027-02-01",
        dataFim: "2023-01-31",
      }),
    ).rejects.toMatchObject({
      cause: { code: CHECK_VIOLATION, constraint_name: "legislatura_periodo_valido" },
    });
  });
});

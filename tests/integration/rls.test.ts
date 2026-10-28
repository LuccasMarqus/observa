import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb, type Database } from "@/db/client";
import { parseServerEnv } from "@/src/config/env";

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

afterAll(async () => {
  await database?.close();
});

describe("Row Level Security", () => {
  // No Supabase, toda tabela do schema public vira API REST acessível com a chave pública.
  // Com RLS ligado e sem políticas, essa API não lê nem escreve nada; os jobs usam conexão direta.
  it("está ligado em todas as tabelas do schema public", async () => {
    const rows = await getDb().execute<{ tabela: string; rls: boolean }>(sql`
      select c.relname as tabela, c.relrowsecurity as rls
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by c.relname
    `);

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((r) => !r.rls).map((r) => r.tabela)).toEqual([]);
  });
});

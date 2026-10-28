// Estrutura comum dos comandos de job: valida configuração, conecta, migra, executa e
// imprime o resultado em JSON. Códigos de saída: 0 sucesso, 2 falha parcial, 1 falha.
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb, type Database } from "@/db/client";
import { parseServerEnv } from "@/src/config/env";
import type { StatusFinal } from "@/src/ingest/lote";

const EXIT_CODE: Record<StatusFinal, number> = { sucesso: 0, falha_parcial: 2, falha: 1 };

/** Valida um argumento inteiro positivo da linha de comando (ano, legislatura). */
export function argumentoInteiro(arg: string | undefined, uso: string): number {
  const n = Number(arg);
  if (!Number.isInteger(n) || n < 1) throw new Error(`Argumento inválido. Uso: ${uso}`);
  return n;
}

export function runJob(
  nome: string,
  executar: (db: Database["db"]) => Promise<{ status: StatusFinal } & Record<string, unknown>>,
): void {
  async function main(): Promise<number> {
    const { DATABASE_URL } = parseServerEnv(process.env);
    const database = createDb(DATABASE_URL);
    try {
      await migrate(database.db, { migrationsFolder: "db/migrations" });
      const result = await executar(database.db);
      process.stdout.write(`${JSON.stringify({ job: nome, ...result })}\n`);
      return EXIT_CODE[result.status];
    } finally {
      await database.close();
    }
  }

  main().then(
    (code) => process.exit(code),
    (error: unknown) => {
      process.stderr.write(`${nome} falhou: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    },
  );
}

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export interface Database {
  db: PostgresJsDatabase<typeof schema>;
  close: () => Promise<void>;
}

export function createDb(databaseUrl: string): Database {
  // onnotice: avisos informativos do Postgres (ex.: "schema already exists") não são erros.
  // prepare: false — o pooler do Supabase em modo transação (porta 6543) não suporta prepared statements.
  const client = postgres(databaseUrl, { max: 5, onnotice: () => {}, prepare: false });
  return {
    db: drizzle(client, { schema }),
    close: () => client.end(),
  };
}

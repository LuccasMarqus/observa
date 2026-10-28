import { count, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import { deputado, despesa } from "@/db/schema";
import type { DespesasWriter } from "@/src/ingest/sync-despesas";

type Db = Database["db"];

// 10 colunas × 1.000 linhas = 10 mil parâmetros, bem abaixo do limite de 65.535 do Postgres.
const TAMANHO_LOTE = 1_000;

export function createDespesasRepository(db: Db): DespesasWriter {
  return {
    async idsDeputadosConhecidos(ids) {
      if (ids.length === 0) return new Set();
      const rows = await db.select({ id: deputado.id }).from(deputado).where(inArray(deputado.id, [...ids]));
      return new Set(rows.map(({ id }) => id));
    },

    async contarAno(ano) {
      const [row] = await db.select({ total: count() }).from(despesa).where(eq(despesa.ano, ano));
      return row?.total ?? 0;
    },

    async substituirAno(ano, rows) {
      // Tudo numa transação: se algum lote falhar, o ano continua com os dados anteriores.
      await db.transaction(async (tx) => {
        await tx.delete(despesa).where(eq(despesa.ano, ano));
        for (let inicio = 0; inicio < rows.length; inicio += TAMANHO_LOTE) {
          await tx.insert(despesa).values(rows.slice(inicio, inicio + TAMANHO_LOTE));
        }
      });
    },
  };
}

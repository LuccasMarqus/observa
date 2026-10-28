import { eq, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { autoria, legislatura, mandato, proposicao } from "@/db/schema";
import type { ProposicoesStore } from "@/src/ingest/sync-proposicoes";

type Db = Database["db"];

const excluded = (column: string) => sql`excluded.${sql.identifier(column)}`;

export function createProposicoesRepository(db: Db): ProposicoesStore {
  return {
    async legislatura(id) {
      const [row] = await db
        .select({ dataInicio: legislatura.dataInicio, dataFim: legislatura.dataFim })
        .from(legislatura)
        .where(eq(legislatura.id, id));
      return row ?? null;
    },

    async deputadosDaLegislatura(id) {
      const rows = await db
        .select({ id: mandato.deputadoId })
        .from(mandato)
        .where(eq(mandato.legislaturaId, id))
        .orderBy(mandato.deputadoId);
      return rows.map((row) => row.id);
    },

    async gravarAutorias(deputadoId, rows) {
      if (rows.length === 0) return;
      await db.transaction(async (tx) => {
        await tx
          .insert(proposicao)
          .values([...rows])
          .onConflictDoUpdate({
            target: proposicao.id,
            set: {
              siglaTipo: excluded("sigla_tipo"),
              numero: excluded("numero"),
              ano: excluded("ano"),
              ementa: excluded("ementa"),
              dataApresentacao: excluded("data_apresentacao"),
              atualizadoEm: excluded("atualizado_em"),
            },
          });
        await tx
          .insert(autoria)
          .values(rows.map(({ id }) => ({ proposicaoId: id, deputadoId })))
          .onConflictDoNothing();
      });
    },
  };
}

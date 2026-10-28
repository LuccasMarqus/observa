import { eq, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { deputado, ingestaoExecucao, legislatura, mandato } from "@/db/schema";
import type { IngestaoLog } from "@/src/ingest/lote";
import type { DeputadosWriter } from "@/src/ingest/sync-deputados";

type Db = Database["db"];

// `excluded.<coluna>` é o valor que a linha teria no insert: base do upsert idempotente.
// sql.identifier escapa o nome da coluna, então o helper continua seguro se o uso mudar.
const excluded = (column: string) => sql`excluded.${sql.identifier(column)}`;

export function createDeputadosRepository(db: Db): DeputadosWriter {
  return {
    async upsertLegislaturas(rows) {
      if (rows.length === 0) return;
      await db
        .insert(legislatura)
        .values([...rows])
        .onConflictDoUpdate({
          target: legislatura.id,
          set: { dataInicio: excluded("data_inicio"), dataFim: excluded("data_fim") },
        });
    },

    async upsertDeputadoComMandato(novoDeputado, novoMandato) {
      await db.transaction(async (tx) => {
        await tx
          .insert(deputado)
          .values(novoDeputado)
          .onConflictDoUpdate({
            target: deputado.id,
            set: {
              nomeCivil: novoDeputado.nomeCivil,
              nomeEleitoral: novoDeputado.nomeEleitoral,
              sexo: novoDeputado.sexo,
              dataNascimento: novoDeputado.dataNascimento,
              ufNascimento: novoDeputado.ufNascimento,
              municipioNascimento: novoDeputado.municipioNascimento,
              escolaridade: novoDeputado.escolaridade,
              urlFoto: novoDeputado.urlFoto,
              atualizadoEm: novoDeputado.atualizadoEm,
            },
          });

        await tx
          .insert(mandato)
          .values(novoMandato)
          .onConflictDoUpdate({
            target: [mandato.deputadoId, mandato.legislaturaId],
            set: {
              siglaPartido: novoMandato.siglaPartido,
              siglaUf: novoMandato.siglaUf,
              situacao: novoMandato.situacao,
              condicaoEleitoral: novoMandato.condicaoEleitoral,
            },
          });
      });
    },
  };
}

export function createIngestaoLog(db: Db, now: () => Date = () => new Date()): IngestaoLog {
  return {
    async start(job, iniciadoEm) {
      const [row] = await db
        .insert(ingestaoExecucao)
        .values({ job, iniciadoEm, status: "rodando" })
        .returning({ id: ingestaoExecucao.id });
      return row.id;
    },

    async finish(id, fim) {
      await db
        .update(ingestaoExecucao)
        .set({ ...fim, finalizadoEm: now() })
        .where(eq(ingestaoExecucao.id, id));
    },
  };
}

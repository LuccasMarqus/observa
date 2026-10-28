// Uso: npm run sync:votacoes -- <dataInicio> <dataFim>   (datas AAAA-MM-DD)
// Requer os deputados da legislatura já sincronizados (npm run sync:deputados).
import { syncVotacoes } from "@/src/ingest/sync-votacoes";
import { createIngestaoLog } from "@/src/repositories/deputados";
import { createVotacoesRepository } from "@/src/repositories/votacoes";
import { createCamaraClient } from "@/src/sources/camara/client";
import { runJob } from "./run-job";

function parsePeriodo([dataInicio, dataFim]: string[]): { dataInicio: string; dataFim: string } {
  if (!dataInicio || !dataFim) {
    throw new Error("Informe o período. Ex.: npm run sync:votacoes -- 2026-08-01 2026-10-27");
  }
  return { dataInicio, dataFim };
}

runJob("sync-votacoes", async (db) => {
  const periodo = parsePeriodo(process.argv.slice(2));
  const result = await syncVotacoes(
    {
      client: createCamaraClient(),
      votacoes: createVotacoesRepository(db),
      ingestao: createIngestaoLog(db),
      now: () => new Date(),
    },
    periodo,
  );
  return { ...periodo, ...result };
});

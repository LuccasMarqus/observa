// Uso: npm run sync:proposicoes -- <idLegislatura>
// Requer os deputados da legislatura já sincronizados (npm run sync:deputados).
import { syncProposicoes } from "@/src/ingest/sync-proposicoes";
import { createIngestaoLog } from "@/src/repositories/deputados";
import { createProposicoesRepository } from "@/src/repositories/proposicoes";
import { createCamaraClient } from "@/src/sources/camara/client";
import { argumentoInteiro, runJob } from "./run-job";

runJob("sync-proposicoes", async (db) => {
  const idLegislatura = argumentoInteiro(process.argv[2], "npm run sync:proposicoes -- 57");
  const result = await syncProposicoes(
    {
      client: createCamaraClient(),
      proposicoes: createProposicoesRepository(db),
      ingestao: createIngestaoLog(db),
      now: () => new Date(),
    },
    idLegislatura,
  );
  return { idLegislatura, ...result };
});

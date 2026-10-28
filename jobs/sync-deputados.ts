// Uso: npm run sync:deputados -- <idLegislatura>
import { syncDeputados } from "@/src/ingest/sync-deputados";
import { createDeputadosRepository, createIngestaoLog } from "@/src/repositories/deputados";
import { createCamaraClient } from "@/src/sources/camara/client";
import { argumentoInteiro, runJob } from "./run-job";

runJob("sync-deputados", async (db) => {
  const idLegislatura = argumentoInteiro(process.argv[2], "npm run sync:deputados -- 57");
  const result = await syncDeputados(
    {
      client: createCamaraClient(),
      deputados: createDeputadosRepository(db),
      ingestao: createIngestaoLog(db),
      now: () => new Date(),
    },
    idLegislatura,
  );
  return { idLegislatura, ...result };
});

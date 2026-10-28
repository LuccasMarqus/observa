// Uso: npm run sync:despesas -- <ano>
// Requer os deputados já sincronizados (npm run sync:deputados).
import { syncDespesas } from "@/src/ingest/sync-despesas";
import { createDespesasRepository } from "@/src/repositories/despesas";
import { createIngestaoLog } from "@/src/repositories/deputados";
import { lerDespesasCsv } from "@/src/sources/camara/cotas";
import { baixarArquivoCotas } from "@/src/sources/camara/cotas-download";
import { argumentoInteiro, runJob } from "./run-job";

runJob("sync-despesas", async (db) => {
  const ano = argumentoInteiro(process.argv[2], "npm run sync:despesas -- 2026");
  const result = await syncDespesas(
    {
      obterDespesas: async (a) => lerDespesasCsv(await baixarArquivoCotas(a)),
      despesas: createDespesasRepository(db),
      ingestao: createIngestaoLog(db),
      now: () => new Date(),
    },
    ano,
  );
  // As falhas aqui são deputados não sincronizados: o resumo basta, a lista fica no log.
  return { ano, status: result.status, lidos: result.lidos, gravados: result.gravados, deputadosIgnorados: result.falhas.length };
});

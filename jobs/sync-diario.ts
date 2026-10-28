// Uso: npm run sync:diario -- <idLegislatura>
// Roda, em ordem, deputados → votações (últimos 30 dias) → despesas do ano → proposições.
// Cada etapa roda mesmo se a anterior falhar (as seguintes usam os deputados já gravados);
// o resultado final é o pior status entre elas. Agendado no GitHub Actions (.github/workflows/sync.yml).
import { planoDiario } from "@/src/ingest/plano-diario";
import type { StatusFinal } from "@/src/ingest/lote";
import { syncDeputados } from "@/src/ingest/sync-deputados";
import { syncDespesas } from "@/src/ingest/sync-despesas";
import { syncProposicoes } from "@/src/ingest/sync-proposicoes";
import { syncVotacoes } from "@/src/ingest/sync-votacoes";
import { createDeputadosRepository, createIngestaoLog } from "@/src/repositories/deputados";
import { createDespesasRepository } from "@/src/repositories/despesas";
import { createProposicoesRepository } from "@/src/repositories/proposicoes";
import { createVotacoesRepository } from "@/src/repositories/votacoes";
import { createCamaraClient } from "@/src/sources/camara/client";
import { lerDespesasCsv } from "@/src/sources/camara/cotas";
import { baixarArquivoCotas } from "@/src/sources/camara/cotas-download";
import { argumentoInteiro, runJob } from "./run-job";

const GRAVIDADE: Record<StatusFinal, number> = { sucesso: 0, falha_parcial: 1, falha: 2 };

function pior(statuses: readonly StatusFinal[]): StatusFinal {
  return statuses.reduce((a, b) => (GRAVIDADE[b] > GRAVIDADE[a] ? b : a), "sucesso");
}

runJob("sync-diario", async (db) => {
  const plano = planoDiario(new Date(), argumentoInteiro(process.argv[2], "npm run sync:diario -- 57"));
  const client = createCamaraClient();
  const ingestao = createIngestaoLog(db);
  const now = () => new Date();

  const deputados = await syncDeputados({ client, deputados: createDeputadosRepository(db), ingestao, now }, plano.legislatura);
  const votacoes = await syncVotacoes({ client, votacoes: createVotacoesRepository(db), ingestao, now }, plano.votacoes);
  const despesas = [];
  for (const ano of plano.anosDespesas) {
    const result = await syncDespesas(
      {
        obterDespesas: async (a) => lerDespesasCsv(await baixarArquivoCotas(a)),
        despesas: createDespesasRepository(db),
        ingestao,
        now,
      },
      ano,
    );
    despesas.push({ ano, status: result.status, gravados: result.gravados });
  }
  const proposicoes = await syncProposicoes(
    { client, proposicoes: createProposicoesRepository(db), ingestao, now },
    plano.legislatura,
  );

  const etapas = {
    deputados: { status: deputados.status, gravados: deputados.gravados },
    votacoes: { ...plano.votacoes, status: votacoes.status, gravados: votacoes.gravados },
    despesas,
    proposicoes: { status: proposicoes.status, gravados: proposicoes.gravados },
  };
  const status = pior([deputados.status, votacoes.status, ...despesas.map((d) => d.status), proposicoes.status]);
  return { status, legislatura: plano.legislatura, etapas };
});

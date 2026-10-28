import type { proposicao } from "@/db/schema";
import type { CamaraClient } from "@/src/sources/camara/client";
import type { ProposicaoResumo } from "@/src/sources/camara/schemas";
import {
  mensagem,
  processarEmLote,
  resumoDoErro,
  statusDoLote,
  type Falha,
  type IngestaoLog,
  type StatusFinal,
} from "./lote";

export const JOB_SYNC_PROPOSICOES = "sync-proposicoes";
// MVP: projetos de lei, emendas constitucionais e leis complementares (plano, seção "Perfil").
export const TIPOS_PROPOSICAO = ["PL", "PEC", "PLP"] as const;
const MAX_FALHAS_SEGUIDAS = 10;

export type ProposicaoRow = typeof proposicao.$inferInsert;

export interface ProposicoesStore {
  legislatura(id: number): Promise<{ dataInicio: string; dataFim: string } | null>;
  deputadosDaLegislatura(id: number): Promise<number[]>;
  gravarAutorias(deputadoId: number, rows: readonly ProposicaoRow[]): Promise<void>;
}

export interface SyncProposicoesDeps {
  client: Pick<CamaraClient, "listProposicoesPorAutor">;
  proposicoes: ProposicoesStore;
  ingestao: IngestaoLog;
  now: () => Date;
}

export interface SyncProposicoesResult {
  status: StatusFinal;
  lidos: number;
  gravados: number;
  falhas: Falha<number>[];
}

/** A API não filtra por período maior que 3 meses: filtra aqui pela data de apresentação. */
function apresentadaNoPeriodo(p: ProposicaoResumo, { dataInicio, dataFim }: { dataInicio: string; dataFim: string }): boolean {
  const dia = p.dataApresentacao?.slice(0, 10);
  return dia !== undefined && dia >= dataInicio && dia <= dataFim;
}

function toProposicaoRow(p: ProposicaoResumo, atualizadoEm: Date): ProposicaoRow {
  return {
    id: p.id,
    siglaTipo: p.siglaTipo,
    numero: p.numero,
    ano: p.ano,
    ementa: p.ementa,
    dataApresentacao: p.dataApresentacao,
    atualizadoEm,
  };
}

async function executar(
  deps: SyncProposicoesDeps,
  idLegislatura: number,
): Promise<{ result: SyncProposicoesResult; erro: string | null }> {
  let lidos = 0;
  try {
    const periodo = await deps.proposicoes.legislatura(idLegislatura);
    if (!periodo) throw new Error(`Legislatura ${idLegislatura} não sincronizada; rode sync-deputados -- ${idLegislatura} antes`);
    const deputados = await deps.proposicoes.deputadosDaLegislatura(idLegislatura);
    if (deputados.length === 0) throw new Error(`Legislatura ${idLegislatura} sem deputados sincronizados; rode sync-deputados`);
    lidos = deputados.length;

    const lote = await processarEmLote(
      deputados,
      (id) => id,
      async (deputadoId) => {
        const lista = await deps.client.listProposicoesPorAutor(deputadoId, TIPOS_PROPOSICAO);
        // A paginação pode repetir um id; o upsert em lote não aceita a mesma linha duas vezes.
        const unicas = lista.filter((p, i) => lista.findIndex(({ id }) => id === p.id) === i);
        const rows = unicas.filter((p) => apresentadaNoPeriodo(p, periodo)).map((p) => toProposicaoRow(p, deps.now()));
        await deps.proposicoes.gravarAutorias(deputadoId, rows);
      },
      MAX_FALHAS_SEGUIDAS,
    );
    const result = { status: statusDoLote(lote), lidos, gravados: lote.gravados, falhas: lote.falhas };
    return { result, erro: resumoDoErro(lote, "deputado(s)", MAX_FALHAS_SEGUIDAS) };
  } catch (error) {
    return { result: { status: "falha", lidos, gravados: 0, falhas: [] }, erro: mensagem(error) };
  }
}

/** Sincroniza as proposições (PL, PEC, PLP) apresentadas pelos deputados durante a legislatura. */
export async function syncProposicoes(deps: SyncProposicoesDeps, idLegislatura: number): Promise<SyncProposicoesResult> {
  const execucaoId = await deps.ingestao.start(JOB_SYNC_PROPOSICOES, deps.now());
  const { result, erro } = await executar(deps, idLegislatura);
  await deps.ingestao.finish(execucaoId, {
    status: result.status,
    registrosLidos: result.lidos,
    registrosGravados: result.gravados,
    erro,
  });
  return result;
}

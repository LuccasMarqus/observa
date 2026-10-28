import type { orientacao, votacao, voto } from "@/db/schema";
import type { CamaraClient } from "@/src/sources/camara/client";
import type { Orientacao, VotacaoResumo, Voto } from "@/src/sources/camara/schemas";
import {
  mensagem,
  processarEmLote,
  resumoDoErro,
  statusDoLote,
  type Falha,
  type IngestaoLog,
  type StatusFinal,
} from "./lote";

export const JOB_SYNC_VOTACOES = "sync-votacoes";
const MAX_FALHAS_SEGUIDAS = 10;

export type VotacaoRow = typeof votacao.$inferInsert;
export type VotoRow = typeof voto.$inferInsert;
export type OrientacaoRow = typeof orientacao.$inferInsert;

export interface VotacoesWriter {
  /** Grava a votação e substitui seus votos e orientações (idempotente). */
  gravarVotacao(votacao: VotacaoRow, votos: readonly VotoRow[], orientacoes: readonly OrientacaoRow[]): Promise<void>;
}

export interface Periodo {
  dataInicio: string;
  dataFim: string;
}

export interface SyncVotacoesDeps {
  client: Pick<CamaraClient, "listVotacoesPlenario" | "getVotos" | "getOrientacoes">;
  votacoes: VotacoesWriter;
  ingestao: IngestaoLog;
  now: () => Date;
}

export interface SyncVotacoesResult {
  status: StatusFinal;
  lidos: number;
  gravados: number;
  falhas: Falha<string>[];
}

function primeiraPorChave<T>(itens: readonly T[], chave: (item: T) => string | number): T[] {
  return itens.filter((item, index) => itens.findIndex((outro) => chave(outro) === chave(item)) === index);
}

export function toVotacaoRow(resumo: VotacaoResumo, nominal: boolean, atualizadoEm: Date): VotacaoRow {
  return {
    id: resumo.id,
    data: resumo.data,
    dataHoraRegistro: resumo.dataHoraRegistro,
    siglaOrgao: resumo.siglaOrgao,
    descricao: resumo.descricao,
    aprovacao: resumo.aprovacao,
    nominal,
    atualizadoEm,
  };
}

export function toVotoRows(idVotacao: string, votos: readonly Voto[]): VotoRow[] {
  return primeiraPorChave(votos, ({ idDeputado }) => idDeputado).map((v) => ({
    votacaoId: idVotacao,
    deputadoId: v.idDeputado,
    tipoVoto: v.tipoVoto,
    siglaPartido: v.siglaPartido,
    siglaUf: v.siglaUf,
    dataRegistro: v.dataRegistroVoto,
  }));
}

export function toOrientacaoRows(idVotacao: string, orientacoes: readonly Orientacao[]): OrientacaoRow[] {
  // Partido (P) e bloco (B) podem ter a mesma sigla: a chave inclui o tipo de liderança.
  const chave = ({ tipoLideranca, siglaBancada }: Orientacao) => `${tipoLideranca}:${siglaBancada}`;
  return primeiraPorChave(orientacoes, chave).map((o) => ({
    votacaoId: idVotacao,
    siglaBancada: o.siglaBancada,
    tipoLideranca: o.tipoLideranca,
    orientacao: o.orientacao,
  }));
}

async function sincronizarVotacao(deps: SyncVotacoesDeps, resumo: VotacaoResumo): Promise<void> {
  const votos = await deps.client.getVotos(resumo.id);
  const nominal = votos.length > 0;
  // Votação simbólica não tem orientação registrada por voto: economiza uma requisição.
  const orientacoes = nominal ? await deps.client.getOrientacoes(resumo.id) : [];
  await deps.votacoes.gravarVotacao(
    toVotacaoRow(resumo, nominal, deps.now()),
    toVotoRows(resumo.id, votos),
    toOrientacaoRows(resumo.id, orientacoes),
  );
}

async function executar(
  deps: SyncVotacoesDeps,
  periodo: Periodo,
): Promise<{ result: SyncVotacoesResult; erro: string | null }> {
  let lidos = 0;
  try {
    // A mesma votação pode aparecer em duas janelas de consulta: processa uma vez só.
    const lista = primeiraPorChave(await deps.client.listVotacoesPlenario(periodo), ({ id }) => id);
    lidos = lista.length;
    const lote = await processarEmLote(lista, ({ id }) => id, (v) => sincronizarVotacao(deps, v), MAX_FALHAS_SEGUIDAS);
    const result = { status: statusDoLote(lote), lidos, gravados: lote.gravados, falhas: lote.falhas };
    return { result, erro: resumoDoErro(lote, "votação(ões)", MAX_FALHAS_SEGUIDAS) };
  } catch (error) {
    return { result: { status: "falha", lidos, gravados: 0, falhas: [] }, erro: mensagem(error) };
  }
}

/**
 * Sincroniza as votações do Plenário de um período, com votos e orientações.
 * Período sem votações (recesso) é sucesso. Requer os deputados já sincronizados (FK do voto).
 */
export async function syncVotacoes(deps: SyncVotacoesDeps, periodo: Periodo): Promise<SyncVotacoesResult> {
  const execucaoId = await deps.ingestao.start(JOB_SYNC_VOTACOES, deps.now());
  const { result, erro } = await executar(deps, periodo);
  await deps.ingestao.finish(execucaoId, {
    status: result.status,
    registrosLidos: result.lidos,
    registrosGravados: result.gravados,
    erro,
  });
  return result;
}

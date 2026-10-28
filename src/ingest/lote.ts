import type { StatusIngestao } from "@/db/schema";

// Tipos e utilitários comuns aos jobs de ingestão.

export type StatusFinal = Exclude<StatusIngestao, "rodando">;

export interface FimExecucao {
  status: StatusFinal;
  registrosLidos: number;
  registrosGravados: number;
  erro: string | null;
}

export interface IngestaoLog {
  start(job: string, iniciadoEm: Date): Promise<number>;
  finish(id: number, fim: FimExecucao): Promise<void>;
}

export interface Falha<Id> {
  id: Id;
  erro: string;
}

export interface ResultadoLote<Id> {
  gravados: number;
  falhas: Falha<Id>[];
  interrompido: boolean;
}

/**
 * Falha causada pelos dados (ex.: deputado ainda não sincronizado), não pela fonte fora do ar.
 * Não conta para o disjuntor: as próximas requisições têm chance de dar certo.
 */
export class ErroDeDado extends Error {
  override name = "ErroDeDado";
}

export function mensagem(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Processa itens em sequência; a falha de um item é registrada e o lote segue.
 * Disjuntor: após `maxFalhasSeguidas` falhas consecutivas (fonte fora do ar), para.
 */
export async function processarEmLote<T, Id>(
  itens: readonly T[],
  idDe: (item: T) => Id,
  processar: (item: T) => Promise<void>,
  maxFalhasSeguidas: number,
): Promise<ResultadoLote<Id>> {
  const falhas: Falha<Id>[] = [];
  let gravados = 0;
  let seguidas = 0;
  for (const item of itens) {
    if (seguidas >= maxFalhasSeguidas) return { gravados, falhas, interrompido: true };
    try {
      await processar(item);
      gravados += 1;
      seguidas = 0;
    } catch (error) {
      falhas.push({ id: idDe(item), erro: mensagem(error) });
      if (!(error instanceof ErroDeDado)) seguidas += 1;
    }
  }
  return { gravados, falhas, interrompido: false };
}

export function statusDoLote({ gravados, falhas }: ResultadoLote<unknown>): StatusFinal {
  if (falhas.length === 0) return "sucesso";
  return gravados === 0 ? "falha" : "falha_parcial";
}

export function resumoDoErro<Id>(
  { falhas, interrompido }: ResultadoLote<Id>,
  rotulo: string,
  maxFalhasSeguidas: number,
): string | null {
  if (falhas.length === 0) return null;
  const ids = falhas.map(({ id }) => String(id)).join(", ");
  const base = `${falhas.length} ${rotulo} com erro: ${ids}. Primeiro erro: ${falhas[0].erro}`;
  return interrompido ? `Interrompido após ${maxFalhasSeguidas} falhas seguidas. ${base}` : base;
}

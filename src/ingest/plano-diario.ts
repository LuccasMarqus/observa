import type { Periodo } from "./sync-votacoes";

const DIA_MS = 24 * 60 * 60 * 1000;
// Votações podem ser corrigidas pela fonte dias depois: a janela refaz o último mês inteiro.
const JANELA_VOTACOES_DIAS = 30;

export interface PlanoDiario {
  legislatura: number;
  votacoes: Periodo;
  anosDespesas: number[];
}

function isoDia(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

/** O que a sincronização diária refaz. Datas em UTC, independentes do fuso da máquina. */
export function planoDiario(agora: Date, legislatura: number): PlanoDiario {
  if (!Number.isInteger(legislatura) || legislatura < 1) {
    throw new Error(`Legislatura inválida: ${legislatura}`);
  }
  const ano = agora.getUTCFullYear();
  // Em janeiro, lançamentos de dezembro ainda chegam: refaz também o ano anterior.
  const anosDespesas = agora.getUTCMonth() === 0 ? [ano - 1, ano] : [ano];
  return {
    legislatura,
    votacoes: {
      dataInicio: isoDia(agora.getTime() - JANELA_VOTACOES_DIAS * DIA_MS),
      dataFim: isoDia(agora.getTime()),
    },
    anosDespesas,
  };
}

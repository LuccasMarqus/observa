import type { despesa } from "@/db/schema";
import type { DespesaCota, LeituraCotas } from "@/src/sources/camara/cotas";
import { mensagem, type Falha, type IngestaoLog, type StatusFinal } from "./lote";

export const JOB_SYNC_DESPESAS = "sync-despesas";
// Acima disso, o formato do arquivo provavelmente mudou: melhor manter o ano anterior.
const MAX_FRACAO_DESCARTADA = 0.01;
// Arquivo novo com menos de 90% das linhas já gravadas sugere download truncado.
const MIN_FRACAO_DO_GRAVADO = 0.9;

export type DespesaRow = typeof despesa.$inferInsert;

export interface DespesasWriter {
  idsDeputadosConhecidos(ids: readonly number[]): Promise<Set<number>>;
  contarAno(ano: number): Promise<number>;
  /** Troca, numa transação, todas as despesas do ano pelas do arquivo (a fonte corrige lançamentos). */
  substituirAno(ano: number, rows: readonly DespesaRow[]): Promise<void>;
}

export interface SyncDespesasDeps {
  obterDespesas(ano: number): Promise<LeituraCotas>;
  despesas: DespesasWriter;
  ingestao: IngestaoLog;
  now: () => Date;
}

export interface SyncDespesasResult {
  status: StatusFinal;
  lidos: number;
  gravados: number;
  falhas: Falha<number>[];
}

interface Triagem {
  gravaveis: DespesaCota[];
  ignoradas: DespesaCota[];
  outroAno: number;
}

function toDespesaRow(d: DespesaCota): DespesaRow {
  return {
    chave: d.chave,
    deputadoId: d.idDeputado,
    ano: d.ano,
    mes: d.mes,
    categoria: d.categoria,
    fornecedor: d.fornecedor,
    documentoFornecedor: d.documentoFornecedor,
    valorLiquidoCentavos: d.valorLiquidoCentavos,
    dataEmissao: d.dataEmissao,
    urlDocumento: d.urlDocumento,
  };
}

async function triar(deps: SyncDespesasDeps, leitura: LeituraCotas, ano: number): Promise<Triagem> {
  const doAno = leitura.despesas.filter((d) => d.ano === ano);
  const conhecidos = await deps.despesas.idsDeputadosConhecidos([...new Set(doAno.map((d) => d.idDeputado))]);
  return {
    gravaveis: doAno.filter((d) => conhecidos.has(d.idDeputado)),
    ignoradas: doAno.filter((d) => !conhecidos.has(d.idDeputado)),
    outroAno: leitura.despesas.length - doAno.length,
  };
}

/** Recusa substituir o ano quando o arquivo parece quebrado: o perfil mostraria um total errado. */
async function exigirArquivoConfiavel(deps: SyncDespesasDeps, leitura: LeituraCotas, t: Triagem, ano: number): Promise<void> {
  const descartadas = leitura.invalidas + leitura.duplicadas + t.outroAno;
  const total = leitura.despesas.length + leitura.invalidas + leitura.duplicadas;
  if (descartadas > total * MAX_FRACAO_DESCARTADA) {
    throw new Error(`${descartadas} de ${total} linhas descartadas (mais de 1%): o formato do arquivo mudou? Ano ${ano} mantido`);
  }
  // Sem nenhum deputado conhecido, substituir apagaria o ano inteiro.
  if (t.gravaveis.length === 0) throw new Error(`Nenhum deputado do arquivo de ${ano} está sincronizado; rode sync-deputados`);
  const jaGravadas = await deps.despesas.contarAno(ano);
  if (t.gravaveis.length < jaGravadas * MIN_FRACAO_DO_GRAVADO) {
    throw new Error(`Arquivo de ${ano} parece truncado: ${t.gravaveis.length} linhas contra ${jaGravadas} já gravadas; ano mantido`);
  }
}

function avisos(leitura: LeituraCotas, t: Triagem, idsIgnorados: readonly number[]): string | null {
  const partes = [
    t.ignoradas.length > 0
      ? `${t.ignoradas.length} despesa(s) de deputado(s) não sincronizado(s): ${idsIgnorados.join(", ")}; rode sync-deputados`
      : null,
    leitura.invalidas > 0 ? `${leitura.invalidas} linha(s) inválida(s). Primeiro erro: ${leitura.primeiroErro}` : null,
    leitura.duplicadas > 0 ? `${leitura.duplicadas} linha(s) duplicada(s) descartada(s)` : null,
    t.outroAno > 0 ? `${t.outroAno} linha(s) de outro ano descartada(s)` : null,
  ].filter((parte): parte is string => parte !== null);
  return partes.length > 0 ? partes.join(" | ") : null;
}

async function executar(deps: SyncDespesasDeps, ano: number): Promise<{ result: SyncDespesasResult; erro: string | null }> {
  let lidos = 0;
  try {
    const leitura = await deps.obterDespesas(ano);
    lidos = leitura.despesas.length;
    if (lidos === 0) throw new Error(`O arquivo de cotas de ${ano} não tem despesas de deputados`);

    const triagem = await triar(deps, leitura, ano);
    await exigirArquivoConfiavel(deps, leitura, triagem, ano);
    await deps.despesas.substituirAno(ano, triagem.gravaveis.map(toDespesaRow));

    const idsIgnorados = [...new Set(triagem.ignoradas.map((d) => d.idDeputado))];
    const falhas = idsIgnorados.map((id) => ({ id, erro: "deputado não sincronizado" }));
    const erro = avisos(leitura, triagem, idsIgnorados);
    const status: StatusFinal = erro ? "falha_parcial" : "sucesso";
    return { result: { status, lidos, gravados: triagem.gravaveis.length, falhas }, erro };
  } catch (error) {
    return { result: { status: "falha", lidos, gravados: 0, falhas: [] }, erro: mensagem(error) };
  }
}

/** Sincroniza as despesas da cota parlamentar de um ano a partir do arquivo oficial da Câmara. */
export async function syncDespesas(deps: SyncDespesasDeps, ano: number): Promise<SyncDespesasResult> {
  const execucaoId = await deps.ingestao.start(JOB_SYNC_DESPESAS, deps.now());
  const { result, erro } = await executar(deps, ano);
  await deps.ingestao.finish(execucaoId, {
    status: result.status,
    registrosLidos: result.lidos,
    registrosGravados: result.gravados,
    erro,
  });
  return result;
}

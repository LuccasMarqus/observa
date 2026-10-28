import type { deputado, legislatura, mandato } from "@/db/schema";
import type { CamaraClient } from "@/src/sources/camara/client";
import type { DeputadoDetalhe, DeputadoResumo } from "@/src/sources/camara/schemas";
import {
  mensagem,
  processarEmLote,
  resumoDoErro,
  statusDoLote,
  type Falha,
  type IngestaoLog,
  type StatusFinal,
} from "./lote";

export const JOB_SYNC_DEPUTADOS = "sync-deputados";
// Disjuntor: com a API fora do ar, para logo em vez de falhar deputado por deputado por horas.
export const MAX_FALHAS_SEGUIDAS = 10;

export type LegislaturaRow = typeof legislatura.$inferInsert;
export type DeputadoRow = typeof deputado.$inferInsert;
export type MandatoRow = typeof mandato.$inferInsert;

export interface DeputadosWriter {
  upsertLegislaturas(rows: readonly LegislaturaRow[]): Promise<void>;
  upsertDeputadoComMandato(deputado: DeputadoRow, mandato: MandatoRow): Promise<void>;
}

export interface SyncDeputadosDeps {
  client: Pick<CamaraClient, "listLegislaturas" | "listDeputados" | "getDeputado">;
  deputados: DeputadosWriter;
  ingestao: IngestaoLog;
  now: () => Date;
}

export interface SyncResult {
  status: StatusFinal;
  lidos: number;
  gravados: number;
  falhas: Falha<number>[];
}

/**
 * A lista da legislatura traz uma linha por partido em que o deputado esteve, sem ordem garantida.
 * Consolida uma entrada por id; se houver partidos diferentes, o partido fica nulo (ambíguo),
 * para não gravar um valor arbitrário que mudaria entre execuções.
 */
export function consolidarPorId(lista: readonly DeputadoResumo[]): DeputadoResumo[] {
  const primeiras = lista.filter((item, index) => lista.findIndex(({ id }) => id === item.id) === index);
  return primeiras.map((primeira) => {
    const partidos = new Set(lista.filter(({ id }) => id === primeira.id).map(({ siglaPartido }) => siglaPartido));
    return partidos.size === 1 ? primeira : { ...primeira, siglaPartido: null };
  });
}

export function toDeputadoRow(detalhe: DeputadoDetalhe, atualizadoEm: Date): DeputadoRow {
  return {
    id: detalhe.id,
    nomeCivil: detalhe.nomeCivil,
    nomeEleitoral: detalhe.ultimoStatus.nomeEleitoral,
    sexo: detalhe.sexo,
    dataNascimento: detalhe.dataNascimento,
    ufNascimento: detalhe.ufNascimento,
    municipioNascimento: detalhe.municipioNascimento,
    escolaridade: detalhe.escolaridade,
    urlFoto: detalhe.ultimoStatus.urlFoto,
    atualizadoEm,
  };
}

/** Quando o último status é desta legislatura, ele é a fonte do partido atual; senão, usa a lista. */
export function toMandatoRow(resumo: DeputadoResumo, detalhe: DeputadoDetalhe, idLegislatura: number): MandatoRow {
  const status = detalhe.ultimoStatus;
  const statusDaLegislatura = status.idLegislatura === idLegislatura;
  return {
    deputadoId: resumo.id,
    legislaturaId: idLegislatura,
    siglaPartido: statusDaLegislatura ? status.siglaPartido : resumo.siglaPartido,
    siglaUf: statusDaLegislatura ? status.siglaUf : resumo.siglaUf,
    situacao: statusDaLegislatura ? status.situacao : null,
    condicaoEleitoral: statusDaLegislatura ? status.condicaoEleitoral : null,
  };
}

async function executar(
  deps: SyncDeputadosDeps,
  idLegislatura: number,
): Promise<{ result: SyncResult; erro: string | null }> {
  let lidos = 0;
  try {
    const legislaturas = await deps.client.listLegislaturas();
    if (!legislaturas.some(({ id }) => id === idLegislatura)) {
      throw new Error(`Legislatura ${idLegislatura} não encontrada na API da Câmara`);
    }
    await deps.deputados.upsertLegislaturas(legislaturas);

    const lista = consolidarPorId(await deps.client.listDeputados({ idLegislatura }));
    if (lista.length === 0) throw new Error(`A API não retornou deputados para a legislatura ${idLegislatura}`);
    lidos = lista.length;

    const lote = await processarEmLote(
      lista,
      ({ id }) => id,
      async (resumo) => {
        const detalhe = await deps.client.getDeputado(resumo.id);
        await deps.deputados.upsertDeputadoComMandato(
          toDeputadoRow(detalhe, deps.now()),
          toMandatoRow(resumo, detalhe, idLegislatura),
        );
      },
      MAX_FALHAS_SEGUIDAS,
    );
    const result = { status: statusDoLote(lote), lidos, gravados: lote.gravados, falhas: lote.falhas };
    return { result, erro: resumoDoErro(lote, "deputado(s)", MAX_FALHAS_SEGUIDAS) };
  } catch (error) {
    return { result: { status: "falha", lidos, gravados: 0, falhas: [] }, erro: mensagem(error) };
  }
}

/**
 * Sincroniza deputados e mandatos de uma legislatura. Idempotente: pode rodar várias vezes.
 * Se registrar o fim da execução falhar, o erro sobe (os dados já gravados não são reclassificados).
 */
export async function syncDeputados(deps: SyncDeputadosDeps, idLegislatura: number): Promise<SyncResult> {
  const execucaoId = await deps.ingestao.start(JOB_SYNC_DEPUTADOS, deps.now());
  const { result, erro } = await executar(deps, idLegislatura);
  await deps.ingestao.finish(execucaoId, {
    status: result.status,
    registrosLidos: result.lidos,
    registrosGravados: result.gravados,
    erro,
  });
  return result;
}

import { eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import { deputado, orientacao, votacao, voto } from "@/db/schema";
import { ErroDeDado } from "@/src/ingest/lote";
import type { VotacaoRow, VotacoesWriter, VotoRow } from "@/src/ingest/sync-votacoes";

type Db = Database["db"];
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Todo voto precisa de deputado já sincronizado; lista os que faltam para orientar o operador. */
async function exigirDeputadosSincronizados(tx: Tx, idVotacao: string, votos: readonly VotoRow[]): Promise<void> {
  const ids = [...new Set(votos.map(({ deputadoId }) => deputadoId))];
  const existentes = await tx.select({ id: deputado.id }).from(deputado).where(inArray(deputado.id, ids));
  const conhecidos = new Set(existentes.map(({ id }) => id));
  const faltando = ids.filter((id) => !conhecidos.has(id));
  if (faltando.length > 0) {
    throw new ErroDeDado(
      `Votação ${idVotacao} tem voto de deputado(s) não sincronizado(s): ${faltando.join(", ")}; ` +
        "rode sync-deputados da legislatura antes",
    );
  }
}

/** Uma resposta vazia da API não pode apagar votos já gravados e rebaixar a votação a simbólica. */
async function impedirRebaixamento(tx: Tx, nova: VotacaoRow): Promise<void> {
  const [atual] = await tx.select({ nominal: votacao.nominal }).from(votacao).where(eq(votacao.id, nova.id));
  if (atual?.nominal) {
    throw new ErroDeDado(
      `Votação ${nova.id} veio sem votos da API, mas já tinha votos gravados; dados anteriores mantidos`,
    );
  }
}

export function createVotacoesRepository(db: Db): VotacoesWriter {
  return {
    async gravarVotacao(novaVotacao, votos, orientacoes) {
      await db.transaction(async (tx) => {
        if (votos.length > 0) await exigirDeputadosSincronizados(tx, novaVotacao.id, votos);
        else await impedirRebaixamento(tx, novaVotacao);

        await tx
          .insert(votacao)
          .values(novaVotacao)
          .onConflictDoUpdate({
            target: votacao.id,
            set: {
              data: novaVotacao.data,
              dataHoraRegistro: novaVotacao.dataHoraRegistro,
              siglaOrgao: novaVotacao.siglaOrgao,
              descricao: novaVotacao.descricao,
              aprovacao: novaVotacao.aprovacao,
              nominal: novaVotacao.nominal,
              atualizadoEm: novaVotacao.atualizadoEm,
            },
          });
        // Substitui votos e orientações: a API é a fonte da verdade da votação inteira.
        await tx.delete(voto).where(eq(voto.votacaoId, novaVotacao.id));
        await tx.delete(orientacao).where(eq(orientacao.votacaoId, novaVotacao.id));
        if (votos.length > 0) await tx.insert(voto).values([...votos]);
        if (orientacoes.length > 0) await tx.insert(orientacao).values([...orientacoes]);
      });
    },
  };
}

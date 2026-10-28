import { z } from "zod";
import { urlDaCamaraOuNulo } from "./urls";

// Schemas das respostas da API v2 da Câmara (dadosabertos.camara.leg.br/api/v2).
// z.object descarta campos desconhecidos: é assim que o CPF nunca entra no sistema.

const linkSchema = z.object({ rel: z.string(), href: z.string() });

export interface Page<T> {
  dados: T[];
  nextUrl: string | null;
}

export function listResponse<T extends z.ZodType>(item: T) {
  return z
    .object({ dados: z.array(item), links: z.array(linkSchema).default([]) })
    .transform(
      ({ dados, links }): Page<z.output<T>> => ({
        dados,
        nextUrl: links.find((link) => link.rel === "next")?.href ?? null,
      }),
    );
}

export function detailResponse<T extends z.ZodType>(item: T) {
  return z.object({ dados: item });
}

/** A foto vai para <img> no site: só aceita https do domínio da Câmara; o resto vira nulo. */
const urlFotoSchema = z.string().nullish().transform(urlDaCamaraOuNulo);

// Ids de votação da Câmara são como "2236186-60"; o formato restrito impede caminhos na URL.
const idVotacaoSchema = z.string().regex(/^[\w-]+$/);

export const deputadoResumoSchema = z.object({
  id: z.number().int(),
  nome: z.string(),
  siglaPartido: z.string().nullable(),
  siglaUf: z.string(),
  idLegislatura: z.number().int(),
  urlFoto: urlFotoSchema,
  email: z.string().nullish(),
});
export type DeputadoResumo = z.output<typeof deputadoResumoSchema>;

export const deputadoDetalheSchema = z.object({
  id: z.number().int(),
  nomeCivil: z.string(),
  ultimoStatus: z.object({
    nome: z.string(),
    nomeEleitoral: z.string(),
    siglaPartido: z.string().nullable(),
    siglaUf: z.string(),
    idLegislatura: z.number().int(),
    urlFoto: urlFotoSchema,
    data: z.string().nullish(),
    situacao: z.string().nullable(),
    condicaoEleitoral: z.string().nullable(),
  }),
  sexo: z.string().nullable(),
  dataNascimento: z.string().nullable(),
  ufNascimento: z.string().nullable(),
  municipioNascimento: z.string().nullable(),
  escolaridade: z.string().nullable(),
});
export type DeputadoDetalhe = z.output<typeof deputadoDetalheSchema>;

export const legislaturaSchema = z.object({
  id: z.number().int(),
  dataInicio: z.string(),
  dataFim: z.string(),
});
export type Legislatura = z.output<typeof legislaturaSchema>;

export const votacaoResumoSchema = z.object({
  id: idVotacaoSchema,
  data: z.string(),
  dataHoraRegistro: z.string().nullable(),
  siglaOrgao: z.string(),
  descricao: z.string(),
  aprovacao: z.number().int().nullable(),
});
export type VotacaoResumo = z.output<typeof votacaoResumoSchema>;

export const votacaoDetalheSchema = votacaoResumoSchema.extend({
  idOrgao: z.number().int(),
});
export type VotacaoDetalhe = z.output<typeof votacaoDetalheSchema>;

export const votoSchema = z
  .object({
    // Nulo em votação secreta: a fonte registra a presença, não o voto.
    tipoVoto: z.string().nullable(),
    dataRegistroVoto: z.string().nullable(),
    deputado_: z.object({
      id: z.number().int(),
      siglaPartido: z.string().nullable(),
      siglaUf: z.string(),
    }),
  })
  .transform(({ tipoVoto, dataRegistroVoto, deputado_ }) => ({
    tipoVoto,
    dataRegistroVoto,
    idDeputado: deputado_.id,
    siglaPartido: deputado_.siglaPartido,
    siglaUf: deputado_.siglaUf,
  }));
export type Voto = z.output<typeof votoSchema>;

export const orientacaoSchema = z
  .object({
    orientacaoVoto: z.string().nullable(),
    codTipoLideranca: z.string(),
    siglaPartidoBloco: z.string(),
  })
  .transform(({ orientacaoVoto, codTipoLideranca, siglaPartidoBloco }) => ({
    siglaBancada: siglaPartidoBloco,
    tipoLideranca: codTipoLideranca,
    orientacao: orientacaoVoto ? orientacaoVoto : null,
  }));
export type Orientacao = z.output<typeof orientacaoSchema>;

export const proposicaoResumoSchema = z.object({
  id: z.number().int(),
  siglaTipo: z.string(),
  numero: z.number().int(),
  ano: z.number().int(),
  ementa: z.string(),
  dataApresentacao: z.string().nullable(),
});
export type ProposicaoResumo = z.output<typeof proposicaoResumoSchema>;

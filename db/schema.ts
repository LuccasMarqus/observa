import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// Modelo completo em docs/capabilities/meu-deputado.md; as tabelas entram conforme os marcos.
// Todas as tabelas têm RLS ligado e nenhuma política: no Supabase, a API REST pública (chave anon)
// não lê nem escreve nada. O app e os jobs acessam por conexão direta ao Postgres.
export const legislatura = pgTable(
  "legislatura",
  {
    id: integer("id").primaryKey(),
    dataInicio: date("data_inicio").notNull(),
    dataFim: date("data_fim").notNull(),
  },
  (table) => [check("legislatura_periodo_valido", sql`${table.dataFim} > ${table.dataInicio}`)],
).enableRLS();

// Dados pessoais públicos do perfil. O CPF nunca é armazenado (regra fixa do produto).
export const deputado = pgTable("deputado", {
  id: integer("id").primaryKey(),
  nomeCivil: text("nome_civil").notNull(),
  nomeEleitoral: text("nome_eleitoral").notNull(),
  sexo: text("sexo"),
  dataNascimento: date("data_nascimento"),
  ufNascimento: text("uf_nascimento"),
  municipioNascimento: text("municipio_nascimento"),
  escolaridade: text("escolaridade"),
  urlFoto: text("url_foto"),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull(),
}).enableRLS();

// Partido e UF pertencem ao mandato (deputado × legislatura): pessoas trocam de partido.
export const mandato = pgTable(
  "mandato",
  {
    deputadoId: integer("deputado_id")
      .notNull()
      .references(() => deputado.id),
    legislaturaId: integer("legislatura_id")
      .notNull()
      .references(() => legislatura.id),
    siglaPartido: text("sigla_partido"),
    siglaUf: text("sigla_uf").notNull(),
    situacao: text("situacao"),
    condicaoEleitoral: text("condicao_eleitoral"),
  },
  (table) => [
    primaryKey({ columns: [table.deputadoId, table.legislaturaId] }),
    index("mandato_legislatura_uf_idx").on(table.legislaturaId, table.siglaUf),
  ],
).enableRLS();

export const STATUS_INGESTAO = ["rodando", "sucesso", "falha_parcial", "falha"] as const;
export type StatusIngestao = (typeof STATUS_INGESTAO)[number];

export const ingestaoExecucao = pgTable(
  "ingestao_execucao",
  {
    id: serial("id").primaryKey(),
    job: text("job").notNull(),
    iniciadoEm: timestamp("iniciado_em", { withTimezone: true }).notNull(),
    finalizadoEm: timestamp("finalizado_em", { withTimezone: true }),
    status: text("status", { enum: STATUS_INGESTAO }).notNull(),
    registrosLidos: integer("registros_lidos").notNull().default(0),
    registrosGravados: integer("registros_gravados").notNull().default(0),
    erro: text("erro"),
  },
  (table) => [
    check(
      "ingestao_execucao_status_valido",
      sql`${table.status} in ('rodando', 'sucesso', 'falha_parcial', 'falha')`,
    ),
    index("ingestao_execucao_job_idx").on(table.job, table.iniciadoEm),
  ],
).enableRLS();

// Votações do Plenário. A API dá data/hora no horário de Brasília sem fuso: guardamos como veio.
export const votacao = pgTable(
  "votacao",
  {
    id: text("id").primaryKey(),
    data: date("data").notNull(),
    dataHoraRegistro: timestamp("data_hora_registro", { mode: "string" }),
    siglaOrgao: text("sigla_orgao").notNull(),
    descricao: text("descricao").notNull(),
    aprovacao: integer("aprovacao"),
    // Só votações nominais têm votos individuais; as simbólicas ficam registradas sem votos.
    nominal: boolean("nominal").notNull(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull(),
  },
  (table) => [index("votacao_data_idx").on(table.data)],
).enableRLS();

// Partido e UF no momento do voto: trocar de partido depois não reescreve o histórico.
export const voto = pgTable(
  "voto",
  {
    votacaoId: text("votacao_id")
      .notNull()
      .references(() => votacao.id),
    deputadoId: integer("deputado_id")
      .notNull()
      .references(() => deputado.id),
    // Nulo em votação secreta: a Câmara registra a presença, não o voto.
    tipoVoto: text("tipo_voto"),
    siglaPartido: text("sigla_partido_na_data"),
    siglaUf: text("sigla_uf_na_data").notNull(),
    dataRegistro: timestamp("data_registro", { mode: "string" }),
  },
  (table) => [
    primaryKey({ columns: [table.votacaoId, table.deputadoId] }),
    index("voto_deputado_idx").on(table.deputadoId),
  ],
).enableRLS();

// Orientação de partidos (P) e blocos/governo/oposição (B). Orientação nula = não orientou.
export const orientacao = pgTable(
  "orientacao",
  {
    votacaoId: text("votacao_id")
      .notNull()
      .references(() => votacao.id),
    siglaBancada: text("sigla_bancada").notNull(),
    tipoLideranca: text("tipo_lideranca").notNull(),
    orientacao: text("orientacao"),
  },
  // Partido e bloco podem ter a mesma sigla, então o tipo de liderança entra na chave.
  (table) => [primaryKey({ columns: [table.votacaoId, table.tipoLideranca, table.siglaBancada] })],
).enableRLS();

// Despesas da cota parlamentar (CEAP). `chave` = hash das colunas que identificam a linha na fonte.
// Valores em centavos inteiros; CPF de fornecedor pessoa física guardado já mascarado.
export const despesa = pgTable(
  "despesa",
  {
    chave: text("chave").primaryKey(),
    deputadoId: integer("deputado_id")
      .notNull()
      .references(() => deputado.id),
    ano: integer("ano").notNull(),
    mes: integer("mes").notNull(),
    categoria: text("categoria").notNull(),
    fornecedor: text("fornecedor").notNull(),
    documentoFornecedor: text("documento_fornecedor"),
    valorLiquidoCentavos: bigint("valor_liquido_centavos", { mode: "number" }).notNull(),
    dataEmissao: date("data_emissao"),
    urlDocumento: text("url_documento"),
  },
  (table) => [
    index("despesa_deputado_ano_idx").on(table.deputadoId, table.ano),
    index("despesa_ano_idx").on(table.ano),
    check("despesa_mes_valido", sql`${table.mes} between 1 and 12`),
  ],
).enableRLS();

export const proposicao = pgTable("proposicao", {
  id: integer("id").primaryKey(),
  siglaTipo: text("sigla_tipo").notNull(),
  numero: integer("numero").notNull(),
  ano: integer("ano").notNull(),
  ementa: text("ementa").notNull(),
  dataApresentacao: timestamp("data_apresentacao", { mode: "string" }),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull(),
}).enableRLS();

export const autoria = pgTable(
  "autoria",
  {
    proposicaoId: integer("proposicao_id")
      .notNull()
      .references(() => proposicao.id),
    deputadoId: integer("deputado_id")
      .notNull()
      .references(() => deputado.id),
  },
  (table) => [
    primaryKey({ columns: [table.proposicaoId, table.deputadoId] }),
    index("autoria_deputado_idx").on(table.deputadoId),
  ],
).enableRLS();

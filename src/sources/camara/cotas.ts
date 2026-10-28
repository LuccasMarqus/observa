import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { parse } from "csv-parse";
import { urlDaCamaraOuNulo } from "./urls";

// Arquivo anual da Cota para o Exercício da Atividade Parlamentar (CEAP):
// https://www.camara.leg.br/cotas/Ano-AAAA.csv.zip — UTF-8 com BOM, separador ";".
// Colunas com dado pessoal (cpf do deputado, txtPassageiro) nunca são lidas para fora daqui.

const COLUNAS_OBRIGATORIAS = [
  "ideCadastro",
  "numAno",
  "numMes",
  "txtDescricao",
  "txtFornecedor",
  "txtCNPJCPF",
  "vlrLiquido",
  "datEmissao",
  "urlDocumento",
] as const;

// Identificam a despesa. O documento do fornecedor entra já mascarado: com o CPF completo,
// quem visse a chave poderia confirmar um CPF por força bruta (só 10^9 combinações).
const CAMPOS_CHAVE = [
  "ideDocumento", "ideCadastro", "nuDeputadoId", "numAno", "numMes", "numSubCota",
  "numEspecificacaoSubCota", "txtNumero", "indTipoDocumento", "datEmissao",
  "vlrDocumento", "vlrGlosa", "vlrLiquido", "numParcela", "numLote", "numRessarcimento",
  "vlrRestituicao", "txtTrecho",
] as const;

const VALOR = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;
const DATA_HORA = /^(\d{4}-\d{2}-\d{2})T/;
// 11 dígitos isolados, com ou sem pontuação: CPF. Não casa com CNPJ (14 dígitos).
const CPF_NO_TEXTO = /(?<!\d)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?!\d)/g;

export interface DespesaCota {
  chave: string;
  idDeputado: number;
  ano: number;
  mes: number;
  categoria: string;
  fornecedor: string;
  documentoFornecedor: string | null;
  valorLiquidoCentavos: number;
  dataEmissao: string | null;
  urlDocumento: string | null;
}

export interface LeituraCotas {
  despesas: DespesaCota[];
  /** Linhas de lideranças/órgãos, sem deputado: não entram no perfil. */
  semDeputado: number;
  duplicadas: number;
  invalidas: number;
  primeiroErro: string | null;
}

type Linha = Record<string, string>;

// Mensagens de erro nunca reproduzem o valor da fonte: uma coluna deslocada poderia trazer CPF ou nome.

/** "954.3" → 95430. Em centavos inteiros: soma de dinheiro não pode ter erro de ponto flutuante. */
export function parseValorCentavos(valor: string): number {
  const match = VALOR.exec(valor);
  if (!match) throw new Error("Valor monetário inválido");
  const [, sinal, inteiro, fracao = ""] = match;
  const centavos = Number(inteiro) * 100 + Number(fracao.padEnd(2, "0"));
  return sinal ? -centavos : centavos;
}

/** CPF de fornecedor pessoa física é mascarado (LGPD); CNPJ de empresa é público e formatado. */
export function mascararDocumentoFornecedor(documento: string): string | null {
  const d = documento.replace(/\D/g, "");
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return null;
}

/** A fonte às vezes cola o CPF no nome do fornecedor pessoa física ("FULANO 99999999999"). */
export function limparNomeFornecedor(nome: string): string {
  return nome.replace(CPF_NO_TEXTO, "").replace(/\s{2,}/g, " ").trim();
}

function inteiro(valor: string, campo: string, min: number, max: number): number {
  const n = Number(valor);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Campo ${campo} inválido`);
  return n;
}

/** "2026-03-26T00:00:00" → "2026-03-26"; data inexistente (ex.: 30/02) vira nula. */
function dataEmissao(valor: string): string | null {
  const dia = DATA_HORA.exec(valor)?.[1];
  if (!dia) return null;
  const time = Date.parse(`${dia}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().startsWith(dia) ? dia : null;
}

function chaveDa(linha: Linha): string {
  const campos = [...CAMPOS_CHAVE.map((c) => linha[c] ?? ""), mascararDocumentoFornecedor(linha.txtCNPJCPF) ?? ""];
  return createHash("sha256").update(campos.join("\u0001")).digest("hex");
}

function toDespesa(linha: Linha): DespesaCota {
  return {
    chave: chaveDa(linha),
    idDeputado: inteiro(linha.ideCadastro, "ideCadastro", 1, Number.MAX_SAFE_INTEGER),
    ano: inteiro(linha.numAno, "numAno", 2000, 2100),
    mes: inteiro(linha.numMes, "numMes", 1, 12),
    categoria: linha.txtDescricao.trim(),
    fornecedor: limparNomeFornecedor(linha.txtFornecedor),
    documentoFornecedor: mascararDocumentoFornecedor(linha.txtCNPJCPF),
    valorLiquidoCentavos: parseValorCentavos(linha.vlrLiquido),
    dataEmissao: dataEmissao(linha.datEmissao),
    urlDocumento: urlDaCamaraOuNulo(linha.urlDocumento),
  };
}

function exigirColunas(cabecalho: string[]): string[] {
  const faltando = COLUNAS_OBRIGATORIAS.filter((c) => !cabecalho.includes(c));
  if (faltando.length > 0) throw new Error(`Arquivo de cotas sem as colunas: ${faltando.join(", ")}`);
  return cabecalho;
}

/** Lê o CSV anual da cota. Linhas inválidas são contadas, não derrubam a leitura. */
export async function lerDespesasCsv(conteudo: Buffer): Promise<LeituraCotas> {
  const parser = Readable.from([conteudo]).pipe(
    parse({ delimiter: ";", bom: true, columns: exigirColunas, skip_empty_lines: true }),
  );
  const porChave = new Map<string, DespesaCota>();
  const leitura = { semDeputado: 0, duplicadas: 0, invalidas: 0, primeiroErro: null as string | null };
  for await (const linha of parser as AsyncIterable<Linha>) {
    if (!linha.ideCadastro) {
      leitura.semDeputado += 1;
      continue;
    }
    try {
      const despesa = toDespesa(linha);
      if (porChave.has(despesa.chave)) leitura.duplicadas += 1;
      else porChave.set(despesa.chave, despesa);
    } catch (error) {
      leitura.invalidas += 1;
      leitura.primeiroErro ??= error instanceof Error ? error.message : String(error);
    }
  }
  return { despesas: [...porChave.values()], ...leitura };
}

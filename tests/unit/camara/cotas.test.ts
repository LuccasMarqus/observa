import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  lerDespesasCsv,
  limparNomeFornecedor,
  mascararDocumentoFornecedor,
  parseValorCentavos,
} from "@/src/sources/camara/cotas";

const AMOSTRA = readFileSync("tests/fixtures/camara/cotas-amostra.csv");

describe("parseValorCentavos", () => {
  it.each([
    ["1467", 146700],
    ["954.3", 95430],
    ["245.24", 24524],
    ["0.54", 54],
    ["-3393.53", -339353],
    ["0", 0],
  ])("converte %s em %i centavos sem erro de ponto flutuante", (valor, centavos) => {
    expect(parseValorCentavos(valor)).toBe(centavos);
  });

  it.each(["", "abc", "1,50", "1.234.5", "1.505"])("rejeita valor inválido %j", (valor) => {
    expect(() => parseValorCentavos(valor)).toThrow();
  });
});

describe("mascararDocumentoFornecedor", () => {
  it("mascara CPF de pessoa física (LGPD)", () => {
    expect(mascararDocumentoFornecedor("123.456.789/01  -")).toBe("***.456.789-**");
  });

  it("formata CNPJ, que é dado público de empresa", () => {
    expect(mascararDocumentoFornecedor("323.738.120/0017-9")).toBe("32.373.812/0001-79");
  });

  it("devolve nulo para documento vazio ou de tamanho inesperado", () => {
    expect(mascararDocumentoFornecedor("")).toBeNull();
    expect(mascararDocumentoFornecedor("12-3")).toBeNull();
  });
});

describe("limparNomeFornecedor", () => {
  it.each([
    ["FULANO DE TAL 99999999999", "FULANO DE TAL"],
    ["FULANO DE TAL 999.999.999-99", "FULANO DE TAL"],
    ["FULANO DE TAL - CPF 99999999999 ME", "FULANO DE TAL - CPF ME"],
  ])("remove CPF colado ao nome: %j", (nome, esperado) => {
    expect(limparNomeFornecedor(nome)).toBe(esperado);
  });

  it("mantém CNPJ, que é dado público de empresa", () => {
    expect(limparNomeFornecedor("EMPRESA 32373812000179")).toBe("EMPRESA 32373812000179");
  });
});

describe("lerDespesasCsv", () => {
  it("lê as despesas de deputados e ignora as de lideranças", async () => {
    const leitura = await lerDespesasCsv(AMOSTRA);

    expect(leitura.semDeputado).toBe(1);
    expect(leitura.despesas.map((d) => d.idDeputado).sort()).toEqual([204379, 62881, 62881, 73433, 73433]);
  });

  it("mapeia os campos de uma despesa", async () => {
    const { despesas } = await lerDespesasCsv(AMOSTRA);

    expect(despesas.find((d) => d.idDeputado === 204379)).toEqual({
      chave: expect.stringMatching(/^[0-9a-f]{64}$/),
      idDeputado: 204379,
      ano: 2026,
      mes: 3,
      categoria: "MANUTENÇÃO DE ESCRITÓRIO DE APOIO À ATIVIDADE PARLAMENTAR",
      fornecedor: expect.any(String),
      documentoFornecedor: "32.373.812/0001-79",
      valorLiquidoCentavos: 95430,
      dataEmissao: "2026-03-26",
      urlDocumento: expect.stringMatching(/^https:\/\/www\.camara\.leg\.br\//),
    });
  });

  it("guarda estorno como valor negativo", async () => {
    const { despesas } = await lerDespesasCsv(AMOSTRA);

    expect(despesas.some((d) => d.valorLiquidoCentavos === -339353)).toBe(true);
  });

  it("data de emissão inexistente no calendário vira nula (não derruba a gravação do ano)", async () => {
    const texto = AMOSTRA.toString("utf8").replace("2026-03-26T00:00:00", "2026-02-30T00:00:00");

    const { despesas } = await lerDespesasCsv(Buffer.from(texto));

    expect(despesas.find((d) => d.idDeputado === 204379)?.dataEmissao).toBeNull();
  });

  it("aceita data de emissão e URL ausentes", async () => {
    const { despesas } = await lerDespesasCsv(AMOSTRA);
    const telefonia = despesas.find((d) => d.categoria === "TELEFONIA");

    expect(telefonia).toMatchObject({ dataEmissao: null, urlDocumento: null });
  });

  it("descarta linha repetida no arquivo (mesma chave) e conta quantas", async () => {
    const leitura = await lerDespesasCsv(AMOSTRA);

    expect(leitura.duplicadas).toBe(1);
    expect(new Set(leitura.despesas.map((d) => d.chave)).size).toBe(leitura.despesas.length);
  });

  it("nunca expõe CPF do deputado nem nome de passageiro", async () => {
    const { despesas } = await lerDespesasCsv(AMOSTRA);
    const texto = JSON.stringify(despesas);

    expect(texto).not.toContain("00000000000");
    expect(texto).not.toContain("PASSAGEIRO");
  });

  it("remove o CPF que a fonte cola no nome do fornecedor pessoa física", async () => {
    const { despesas } = await lerDespesasCsv(AMOSTRA);

    expect(despesas.map((d) => d.fornecedor)).toContain("FORNECEDOR PESSOA FISICA TESTE");
  });

  it("a chave não depende do CPF completo do fornecedor (não permite confirmar CPF por força bruta)", async () => {
    const outroCpf = Buffer.from(AMOSTRA.toString("utf8").replace("123.456.789/01  -", "999.456.789/77  -"));

    const a = await lerDespesasCsv(AMOSTRA);
    const b = await lerDespesasCsv(outroCpf);

    expect(a.despesas.map((d) => d.chave).sort()).toEqual(b.despesas.map((d) => d.chave).sort());
  });

  it("mensagem de linha inválida não reproduz o valor da fonte", async () => {
    const texto = AMOSTRA.toString("utf8").replace(/("954\.3";"[^"]*";)"954\.3"/, '$1"FULANO 99999999999"');

    const leitura = await lerDespesasCsv(Buffer.from(texto));

    expect(leitura.invalidas).toBe(1);
    expect(leitura.primeiroErro).not.toContain("99999999999");
  });

  it("chave é estável entre leituras (idempotência)", async () => {
    const a = await lerDespesasCsv(AMOSTRA);
    const b = await lerDespesasCsv(AMOSTRA);

    expect(a.despesas.map((d) => d.chave)).toEqual(b.despesas.map((d) => d.chave));
  });

  it("conta linhas inválidas sem derrubar a leitura", async () => {
    // Colunas vlrDocumento;vlrGlosa;vlrLiquido: invalida só o vlrLiquido.
    const texto = AMOSTRA.toString("utf8").replace(/("954\.3";"[^"]*";)"954\.3"/, '$1"não é número"');

    const leitura = await lerDespesasCsv(Buffer.from(texto));

    expect(leitura.invalidas).toBe(1);
    expect(leitura.primeiroErro).toMatch(/valor/i);
  });

  it("rejeita arquivo sem as colunas esperadas", async () => {
    await expect(lerDespesasCsv(Buffer.from('"a";"b"\n"1";"2"\n'))).rejects.toThrow(/colunas/);
  });
});

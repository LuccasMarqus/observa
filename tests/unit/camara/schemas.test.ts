import { describe, expect, it } from "vitest";
import {
  deputadoDetalheSchema,
  deputadoResumoSchema,
  detailResponse,
  legislaturaSchema,
  listResponse,
  orientacaoSchema,
  proposicaoResumoSchema,
  votacaoDetalheSchema,
  votacaoResumoSchema,
  votoSchema,
} from "@/src/sources/camara/schemas";
import deputadosPagina from "../../fixtures/camara/deputados-pagina.json";
import deputadoDetalhe from "../../fixtures/camara/deputado-detalhe.json";
import legislaturas from "../../fixtures/camara/legislaturas.json";
import votacaoDetalhe from "../../fixtures/camara/votacao-detalhe.json";
import votos from "../../fixtures/camara/votos.json";
import orientacoes from "../../fixtures/camara/orientacoes.json";
import proposicoes from "../../fixtures/camara/proposicoes.json";

describe("schemas da API da Câmara", () => {
  describe("lista de deputados", () => {
    it("lê a página real e expõe o link da próxima página", () => {
      const page = listResponse(deputadoResumoSchema).parse(deputadosPagina);

      expect(page.dados).toHaveLength(3);
      expect(page.dados[0]).toMatchObject({ id: 204379, siglaPartido: "MDB", siglaUf: "AP" });
      expect(page.nextUrl).toBe("https://dadosabertos.camara.leg.br/api/v2/deputados?pagina=2&itens=3");
    });

    it("retorna nextUrl nulo na última página", () => {
      const page = listResponse(deputadoResumoSchema).parse({ dados: [], links: [] });

      expect(page.nextUrl).toBeNull();
    });
  });

  describe("detalhe do deputado", () => {
    it("lê os dados do perfil", () => {
      const { dados } = detailResponse(deputadoDetalheSchema).parse(deputadoDetalhe);

      expect(dados).toMatchObject({
        id: 204379,
        nomeCivil: "ACÁCIO DA SILVA FAVACHO NETO",
        ultimoStatus: { nomeEleitoral: "Acácio Favacho", situacao: "Exercício", idLegislatura: 57 },
      });
    });

    it("descarta o CPF (regra fixa do produto)", () => {
      const { dados } = detailResponse(deputadoDetalheSchema).parse(deputadoDetalhe);

      expect(dados).not.toHaveProperty("cpf");
    });
  });

  it("lê legislaturas", () => {
    const page = listResponse(legislaturaSchema).parse(legislaturas);

    expect(page.dados[0]).toEqual({ id: 57, dataInicio: "2023-02-01", dataFim: "2027-01-31" });
  });

  it("lê o detalhe de uma votação nominal do Plenário", () => {
    const { dados } = detailResponse(votacaoDetalheSchema).parse(votacaoDetalhe);

    expect(dados).toMatchObject({ id: "2236186-60", idOrgao: 180, siglaOrgao: "PLEN", aprovacao: 0 });
  });

  describe("votos", () => {
    it("achata o deputado e guarda o partido no momento do voto", () => {
      const page = listResponse(votoSchema).parse(votos);

      expect(page.dados[0]).toEqual({
        tipoVoto: "Sim",
        dataRegistroVoto: "2026-10-14T20:52:43",
        idDeputado: 220588,
        siglaPartido: "REPUBLICANOS",
        siglaUf: "AC",
      });
    });
  });

  it("aceita voto sem tipo (votação secreta: a fonte registra a presença, não o voto)", () => {
    const secreto = {
      tipoVoto: null,
      dataRegistroVoto: "2026-09-02T12:03:39",
      deputado_: { id: 73579, siglaPartido: "PL", siglaUf: "DF" },
    };

    expect(votoSchema.parse(secreto)).toMatchObject({ tipoVoto: null, idDeputado: 73579 });
  });

  describe("orientações", () => {
    it("converte orientação vazia em nulo", () => {
      const page = listResponse(orientacaoSchema).parse(orientacoes);

      expect(page.dados[0]).toEqual({ siglaBancada: "Maioria", tipoLideranca: "B", orientacao: null });
      expect(page.dados[1]).toMatchObject({ siglaBancada: "Governo", orientacao: "Não" });
    });
  });

  it("lê proposições de autoria", () => {
    const page = listResponse(proposicaoResumoSchema).parse(proposicoes);

    expect(page.dados[0]).toMatchObject({ id: 2199117, siglaTipo: "PL", numero: 2485, ano: 2019 });
  });

  it("rejeita resposta sem o campo dados", () => {
    expect(() => listResponse(legislaturaSchema).parse({ links: [] })).toThrow();
  });

  describe("urlFoto (vai para <img> no site)", () => {
    const base = { id: 1, nome: "X", siglaPartido: "PT", siglaUf: "SP", idLegislatura: 57, email: null };

    it("aceita foto https do domínio da Câmara", () => {
      const url = "https://www.camara.leg.br/internet/deputado/bandep/1.jpg";

      expect(deputadoResumoSchema.parse({ ...base, urlFoto: url }).urlFoto).toBe(url);
    });

    it.each([
      ["http sem TLS", "http://www.camara.leg.br/foto.jpg"],
      ["outro domínio", "https://rastreador.example/foto.jpg"],
      ["domínio que só termina parecido", "https://evilcamara.leg.br/foto.jpg"],
      ["esquema javascript", "javascript:alert(1)"],
    ])("descarta (vira nulo) foto com %s", (_caso, url) => {
      expect(deputadoResumoSchema.parse({ ...base, urlFoto: url }).urlFoto).toBeNull();
    });
  });

  it("rejeita id de votação com caracteres de caminho", () => {
    const voto = { id: "../deputados", data: "2026-10-14", dataHoraRegistro: null, siglaOrgao: "PLEN", descricao: "x", aprovacao: 1 };

    expect(() => votacaoResumoSchema.parse(voto)).toThrow();
  });

  it("tolera ausência de campos que o Observa não usa (email)", () => {
    const semEmail = { id: 1, nome: "X", siglaPartido: "PT", siglaUf: "SP", idLegislatura: 57, urlFoto: null };

    expect(deputadoResumoSchema.parse(semEmail).id).toBe(1);
  });

  it("rejeita deputado com id não numérico", () => {
    expect(() => deputadoResumoSchema.parse({ id: "abc", nome: "X", siglaUf: "SP" })).toThrow();
  });
});

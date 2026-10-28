import { describe, expect, it } from "vitest";
import { urlDaCamaraOuNulo } from "@/src/sources/camara/urls";

describe("urlDaCamaraOuNulo", () => {
  it.each([
    "https://www.camara.leg.br/cota-parlamentar/documentos/publ/1/2026/1.pdf",
    "https://camara.leg.br/x",
  ])("aceita https do domínio da Câmara: %s", (url) => {
    expect(urlDaCamaraOuNulo(url)).toBe(url);
  });

  it.each([
    ["vazia", ""],
    ["nula", null],
    ["http", "http://www.camara.leg.br/x"],
    ["outro domínio", "https://evil.example/x"],
    ["sufixo enganoso", "https://evilcamara.leg.br/x"],
    ["javascript", "javascript:alert(1)"],
    ["credenciais embutidas", "https://user:senha@www.camara.leg.br/x"],
  ])("recusa URL %s", (_caso, url) => {
    expect(urlDaCamaraOuNulo(url)).toBeNull();
  });

  it("devolve a forma normalizada da URL", () => {
    expect(urlDaCamaraOuNulo("https://WWW.Camara.leg.br/a b")).toBe("https://www.camara.leg.br/a%20b");
  });
});

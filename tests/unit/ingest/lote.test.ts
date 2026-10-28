import { describe, expect, it, vi } from "vitest";
import {
  ErroDeDado,
  processarEmLote,
  resumoDoErro,
  statusDoLote,
  type ResultadoLote,
  type StatusFinal,
} from "@/src/ingest/lote";

describe("processarEmLote", () => {
  it("processa todos os itens em ordem e conta os gravados", async () => {
    const vistos: number[] = [];

    const result = await processarEmLote([1, 2, 3], (n) => n, async (n) => void vistos.push(n), 10);

    expect(vistos).toEqual([1, 2, 3]);
    expect(result).toEqual({ gravados: 3, falhas: [], interrompido: false });
  });

  it("registra a falha de um item com sua mensagem e segue", async () => {
    const result = await processarEmLote(
      ["a", "b"],
      (s) => s,
      async (s) => {
        if (s === "a") throw new Error("quebrou");
      },
      10,
    );

    expect(result).toEqual({ gravados: 1, falhas: [{ id: "a", erro: "quebrou" }], interrompido: false });
  });

  it("converte erro que não é Error em texto", async () => {
    const result = await processarEmLote([1], (n) => n, async () => Promise.reject("texto"), 10);

    expect(result.falhas).toEqual([{ id: 1, erro: "texto" }]);
  });

  it("para depois do máximo de falhas seguidas", async () => {
    const processar = vi.fn(async () => Promise.reject(new Error("fora do ar")));

    const result = await processarEmLote([1, 2, 3, 4, 5], (n) => n, processar, 3);

    expect(processar).toHaveBeenCalledTimes(3);
    expect(result.interrompido).toBe(true);
  });

  it("não marca interrompido quando as falhas foram as últimas e nada ficou de fora", async () => {
    const result = await processarEmLote([1, 2], (n) => n, async () => Promise.reject(new Error("x")), 2);

    expect(result.interrompido).toBe(false);
    expect(result.falhas).toHaveLength(2);
  });

  it("falha de dado (ErroDeDado) não conta para o disjuntor: a fonte está no ar", async () => {
    const processar = vi.fn(async () => Promise.reject(new ErroDeDado("deputado não sincronizado")));

    const result = await processarEmLote([1, 2, 3, 4, 5], (n) => n, processar, 2);

    expect(processar).toHaveBeenCalledTimes(5);
    expect(result).toMatchObject({ gravados: 0, interrompido: false });
    expect(result.falhas).toHaveLength(5);
  });
});

describe("statusDoLote", () => {
  const casos: Array<[ResultadoLote<number>, StatusFinal]> = [
    [{ gravados: 2, falhas: [], interrompido: false }, "sucesso"],
    [{ gravados: 1, falhas: [{ id: 1, erro: "x" }], interrompido: false }, "falha_parcial"],
    [{ gravados: 0, falhas: [{ id: 1, erro: "x" }], interrompido: true }, "falha"],
  ];

  it.each(casos)("classifica %o como %s", (lote, esperado) => {
    expect(statusDoLote(lote)).toBe(esperado);
  });
});

describe("resumoDoErro", () => {
  it("é nulo sem falhas", () => {
    expect(resumoDoErro({ gravados: 1, falhas: [], interrompido: false }, "item(ns)", 10)).toBeNull();
  });

  it("lista ids e a primeira mensagem", () => {
    const lote = { gravados: 0, falhas: [{ id: "v1", erro: "a" }, { id: "v2", erro: "b" }], interrompido: false };

    expect(resumoDoErro(lote, "votação(ões)", 10)).toBe("2 votação(ões) com erro: v1, v2. Primeiro erro: a");
  });

  it("avisa quando foi interrompido pelo disjuntor", () => {
    const lote = { gravados: 0, falhas: [{ id: 1, erro: "a" }], interrompido: true };

    expect(resumoDoErro(lote, "item(ns)", 10)).toMatch(/^Interrompido após 10 falhas seguidas\./);
  });
});

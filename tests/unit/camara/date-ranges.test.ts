import { describe, expect, it } from "vitest";
import { splitDateRange } from "@/src/sources/camara/date-ranges";

describe("splitDateRange", () => {
  it("mantém um período curto numa única janela", () => {
    expect(splitDateRange("2026-10-01", "2026-10-20", 90)).toEqual([
      { inicio: "2026-10-01", fim: "2026-10-20" },
    ]);
  });

  it("divide um ano em janelas contíguas de no máximo 90 dias, sem sobreposição", () => {
    const janelas = splitDateRange("2026-01-01", "2026-12-31", 90);

    expect(janelas[0]).toEqual({ inicio: "2026-01-01", fim: "2026-03-31" });
    expect(janelas[1].inicio).toBe("2026-04-01");
    expect(janelas.at(-1)?.fim).toBe("2026-12-31");
    expect(janelas).toHaveLength(5);
  });

  it("aceita início igual ao fim", () => {
    expect(splitDateRange("2026-10-14", "2026-10-14", 90)).toEqual([
      { inicio: "2026-10-14", fim: "2026-10-14" },
    ]);
  });

  it("rejeita fim antes do início", () => {
    expect(() => splitDateRange("2026-10-20", "2026-10-01", 90)).toThrow(/anterior/);
  });

  it("rejeita data em formato inválido", () => {
    expect(() => splitDateRange("01/10/2026", "2026-10-20", 90)).toThrow(/AAAA-MM-DD/);
  });

  it("rejeita data que não existe no calendário", () => {
    expect(() => splitDateRange("2026-02-30", "2026-03-10", 90)).toThrow(/AAAA-MM-DD/);
  });

  it("rejeita janela menor que 1 dia", () => {
    expect(() => splitDateRange("2026-10-01", "2026-10-20", 0)).toThrow();
  });
});

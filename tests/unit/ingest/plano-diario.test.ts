import { describe, expect, it } from "vitest";
import { planoDiario } from "@/src/ingest/plano-diario";

describe("planoDiario", () => {
  it("sincroniza votações dos últimos 30 dias e despesas do ano corrente", () => {
    const plano = planoDiario(new Date("2026-10-28T09:00:00Z"), 57);

    expect(plano).toEqual({
      legislatura: 57,
      votacoes: { dataInicio: "2026-09-28", dataFim: "2026-10-28" },
      anosDespesas: [2026],
    });
  });

  it("em janeiro também refaz as despesas do ano anterior (lançamentos de dezembro chegam atrasados)", () => {
    const plano = planoDiario(new Date("2027-01-10T09:00:00Z"), 57);

    expect(plano.anosDespesas).toEqual([2026, 2027]);
    expect(plano.votacoes).toEqual({ dataInicio: "2026-12-11", dataFim: "2027-01-10" });
  });

  it("usa a data em UTC, sem depender do fuso da máquina", () => {
    const plano = planoDiario(new Date("2026-12-31T23:30:00Z"), 57);

    expect(plano.votacoes.dataFim).toBe("2026-12-31");
    expect(plano.anosDespesas).toEqual([2026]);
  });

  it.each([0, -1, 57.5, Number.NaN])("rejeita legislatura inválida %s", (legislatura) => {
    expect(() => planoDiario(new Date("2026-10-28T09:00:00Z"), legislatura)).toThrow(/legislatura/i);
  });
});

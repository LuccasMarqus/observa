const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DateWindow {
  inicio: string;
  fim: string;
}

function parseIsoDate(value: string): number {
  const time = Date.parse(`${value}T00:00:00Z`);
  // Date.parse aceita 2026-02-30 (vira 02/03); a volta para texto detecta datas inexistentes.
  if (!ISO_DATE.test(value) || Number.isNaN(time) || toIsoDate(time) !== value) {
    throw new Error(`Data inválida "${value}": use o formato AAAA-MM-DD`);
  }
  return time;
}

function toIsoDate(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

/** Divide [inicio, fim] (inclusive) em janelas contíguas de no máximo `maxDias` dias. */
export function splitDateRange(inicio: string, fim: string, maxDias: number): DateWindow[] {
  if (!Number.isInteger(maxDias) || maxDias < 1) {
    throw new Error("maxDias deve ser um inteiro maior ou igual a 1");
  }
  const start = parseIsoDate(inicio);
  const end = parseIsoDate(fim);
  if (end < start) {
    throw new Error(`Data final ${fim} é anterior à inicial ${inicio}`);
  }

  const windows: DateWindow[] = [];
  for (let cursor = start; cursor <= end; cursor += maxDias * DAY_MS) {
    const windowEnd = Math.min(cursor + (maxDias - 1) * DAY_MS, end);
    windows.push({ inicio: toIsoDate(cursor), fim: toIsoDate(windowEnd) });
  }
  return windows;
}

import { describe, expect, it } from "vitest";
import { parseServerEnv } from "@/src/config/env";

describe("parseServerEnv", () => {
  it("aceita uma DATABASE_URL postgres válida", () => {
    const env = parseServerEnv({ DATABASE_URL: "postgres://user:pass@localhost:5432/observa" });

    expect(env.DATABASE_URL).toBe("postgres://user:pass@localhost:5432/observa");
  });

  it("aceita o esquema postgresql://", () => {
    const env = parseServerEnv({ DATABASE_URL: "postgresql://localhost/observa" });

    expect(env.DATABASE_URL).toBe("postgresql://localhost/observa");
  });

  it("falha com mensagem clara quando DATABASE_URL está ausente", () => {
    expect(() => parseServerEnv({})).toThrow(/DATABASE_URL/);
  });

  it("rejeita URL que não é de PostgreSQL", () => {
    expect(() => parseServerEnv({ DATABASE_URL: "mysql://localhost/observa" })).toThrow(
      /PostgreSQL/,
    );
  });

  it("não vaza a senha na mensagem de erro", () => {
    expect(() => parseServerEnv({ DATABASE_URL: "mysql://user:segredo@host/db" })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("segredo") }),
    );
  });

  it("exige TLS (sslmode=require) para banco que não é local", () => {
    expect(() => parseServerEnv({ DATABASE_URL: "postgresql://u:p@db.abc.supabase.co:5432/postgres" })).toThrow(
      /sslmode=require/,
    );
  });

  it("aceita banco remoto com TLS", () => {
    const url = "postgresql://u:p@db.abc.supabase.co:5432/postgres?sslmode=require";

    expect(parseServerEnv({ DATABASE_URL: url }).DATABASE_URL).toBe(url);
  });

  it.each([
    ["quebra de linha no fim", "\n"],
    ["espaço no fim", " "],
    ["CRLF do Windows", "\r\n"],
  ])("ignora %s (comum ao colar o segredo no GitHub)", (_caso, sufixo) => {
    const url = "postgresql://u:p@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require";

    expect(parseServerEnv({ DATABASE_URL: `${url}${sufixo}` }).DATABASE_URL).toBe(url);
  });

  it("ignora aspas em volta da URL", () => {
    const url = "postgresql://u:p@db.abc.supabase.co:5432/postgres?sslmode=require";

    expect(parseServerEnv({ DATABASE_URL: `"${url}"` }).DATABASE_URL).toBe(url);
  });

  it("explica quando a URL é ilegível, sem mostrar o valor", () => {
    const comCaractereEspecial = "postgresql://u:se#nha@db.abc.supabase.co:5432/postgres?sslmode=require";

    expect(() => parseServerEnv({ DATABASE_URL: comCaractereEspecial })).toThrow(
      expect.objectContaining({ message: expect.stringMatching(/sslmode=require[\s\S]*caractere especial/) }),
    );
    expect(() => parseServerEnv({ DATABASE_URL: comCaractereEspecial })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("se#nha") }),
    );
  });

  it.each(["localhost", "127.0.0.1"])("dispensa TLS no banco local (%s)", (host) => {
    const url = `postgres://u:p@${host}:54329/observa`;

    expect(parseServerEnv({ DATABASE_URL: url }).DATABASE_URL).toBe(url);
  });

  it("retorna um objeto novo sem mutar a entrada", () => {
    const input = Object.freeze({ DATABASE_URL: "postgres://localhost/observa", OUTRA: "x" });

    const env = parseServerEnv(input);

    expect(env).not.toBe(input);
    expect(env).toEqual({ DATABASE_URL: "postgres://localhost/observa" });
  });
});

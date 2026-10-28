import { z } from "zod";

const POSTGRES_URL_PATTERN = /^postgres(ql)?:\/\//;
const HOSTS_LOCAIS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const SSLMODES_SEGUROS = new Set(["require", "verify-ca", "verify-full"]);

/** Fora da máquina local, credenciais e dados não podem trafegar sem TLS. */
function temTlsSeRemoto(url: string): boolean {
  if (!URL.canParse(url)) return false;
  const { hostname, searchParams } = new URL(url);
  return HOSTS_LOCAIS.has(hostname) || SSLMODES_SEGUROS.has(searchParams.get("sslmode") ?? "");
}

/** Espaços, quebras de linha e aspas nas pontas nunca fazem parte da URL (comuns ao colar um segredo). */
function limparValor(valor: unknown): unknown {
  return typeof valor === "string" ? valor.trim().replace(/^(["'])([\s\S]*)\1$/, "$2").trim() : valor;
}

const serverEnvSchema = z.object({
  DATABASE_URL: z.preprocess(
    limparValor,
    z
      .string({ error: "DATABASE_URL não definida" })
      .regex(POSTGRES_URL_PATTERN, { error: "DATABASE_URL deve ser uma URL de PostgreSQL" })
      .refine(temTlsSeRemoto, {
        error:
          "DATABASE_URL de banco remoto deve terminar com ?sslmode=require. Se ela já termina assim, " +
          "a senha provavelmente tem caractere especial (# ? / @ %) que quebra a URL: troque a senha por " +
          "uma só com letras e números",
      }),
  ),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/**
 * Valida as variáveis de ambiente do servidor e devolve só as conhecidas.
 * A mensagem de erro cita apenas o nome da variável, nunca o valor (pode conter senha).
 */
export function parseServerEnv(source: Readonly<Record<string, string | undefined>>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => issue.message).join("; ");
    throw new Error(`Configuração inválida: ${problems}`);
  }
  return result.data;
}

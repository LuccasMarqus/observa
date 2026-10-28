// Os testes de integração gravam e apagam linhas de teste: só podem rodar contra um banco local.
// Impede que uma DATABASE_URL de produção (Supabase) em uso no terminal seja alterada por engano.
const HOSTS_LOCAIS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const url = process.env.DATABASE_URL ?? "";
const host = URL.canParse(url) ? new URL(url).hostname : "";
if (!HOSTS_LOCAIS.has(host)) {
  throw new Error(
    "Testes de integração só rodam com DATABASE_URL apontando para um banco local (docker compose up -d db)",
  );
}

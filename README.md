# Observa

Site para cidadãos brasileiros acompanharem o que seus representantes fazem com o voto que receberam, sempre com fonte oficial.

- Produto: [PRODUCT-BRIEF.md](PRODUCT-BRIEF.md)
- Plano técnico do MVP "Meu Deputado": [docs/capabilities/meu-deputado.md](docs/capabilities/meu-deputado.md)
- Evidências de TDD: [docs/tdd/](docs/tdd/)

## Requisitos

- Node.js 24
- Docker (para o Postgres local)

## Começando

```bash
npm install
cp .env.example .env.local
docker compose up -d --wait db
npm run dev
```

O site abre em http://localhost:3000.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run lint` | ESLint |
| `npm run typecheck` | Checagem de tipos (tsc) |
| `npm test` | Testes unitários (Vitest) |
| `npm run test:integration` | Testes de integração; precisa de `DATABASE_URL` e do Postgres local |
| `npm run test:coverage` | Unitários + integração com cobertura (mínimo 80%) |
| `npm run test:e2e` | E2E com Playwright (desktop e celular) |
| `npm run db:generate` | Gera migração a partir de `db/schema.ts` |
| `npm run db:migrate` | Aplica migrações no banco de `DATABASE_URL` |
| `npm run sync:deputados -- 57` | Baixa deputados e mandatos da legislatura 57 da API da Câmara (lê `.env.local`; ~3 min) |
| `npm run sync:votacoes -- 2026-08-01 2026-10-27` | Baixa votações do Plenário do período, com votos e orientações (rode `sync:deputados` antes; ~1 min por trimestre) |
| `npm run sync:despesas -- 2026` | Baixa o arquivo anual da cota parlamentar e substitui as despesas do ano (rode `sync:deputados` antes; ~20 s) |
| `npm run sync:proposicoes -- 57` | Baixa PL, PEC e PLP apresentados pelos deputados durante a legislatura (rode `sync:deputados` antes) |

Ordem recomendada numa base nova: `sync:deputados` → `sync:votacoes`, `sync:despesas` e `sync:proposicoes` (estes três em qualquer ordem).

Antes do primeiro E2E: `npx playwright install chromium`.

## Estrutura

```
app/            rotas Next.js (App Router)
src/            código de domínio, configuração e fontes de dados
src/sources/    clientes das fontes oficiais (API da Câmara)
src/ingest/     lógica dos jobs de ingestão
src/repositories/ acesso ao banco
jobs/           comandos que executam os jobs
db/             schema Drizzle, cliente e migrações
tests/          unit/, integration/, e2e/
docs/           plano técnico e evidências
```

## Banco de produção (Supabase)

- Projeto `observa` na região São Paulo (`sa-east-1`), plano gratuito.
- Schema aplicado com as mesmas migrações de `db/migrations`, registradas no controle do Drizzle: os jobs reconhecem o que já foi aplicado.
- **RLS ligado em todas as tabelas, sem políticas**: a API REST pública do Supabase (chave anon) não lê nem escreve nada. Jobs e site acessam por conexão direta ao Postgres.
- Conexão: use o **Session pooler** (o acesso direto do plano gratuito é só IPv6) com `?sslmode=require`; veja `.env.example`.
- Os testes de integração se recusam a rodar contra banco que não seja local.

## CI

`.github/workflows/ci.yml` roda em cada push na `main` e em pull requests: lint, tipos e testes unitários; testes de integração com cobertura contra um Postgres temporário; e E2E sobre o build de produção.

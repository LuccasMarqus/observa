# TDD — M0: esqueleto do projeto

> Relatório de evidências da skill ECC `tdd-workflow`. Data: 27/10/2026.

## Plano de origem

Marco M0 de [docs/capabilities/meu-deputado.md](../capabilities/meu-deputado.md): "Esqueleto do projeto: Next.js, Drizzle, Vitest, Playwright, CI no GitHub Actions — pronto quando o CI estiver verde com um teste de fumaça."

## Jornadas

- Como eleitor(a), quero abrir o Observa no celular e entender em uma frase o que ele faz.
- Como mantenedor(a), quero que o app recuse subir com uma `DATABASE_URL` ausente ou inválida, sem vazar a senha no erro.
- Como mantenedor(a), quero que as migrações criem o banco e que regras de integridade (período da legislatura) sejam garantidas pelo próprio Postgres.

## Ciclos RED → GREEN

| Alvo | RED (comando e resultado) | GREEN (comando e resultado) |
|---|---|---|
| Página inicial | `npm test` → 3 testes falharam: não havia h1 "Observa" e o texto "To get started" do template aparecia | `npm test` → 9/9 passaram após reescrever `app/page.tsx` |
| `parseServerEnv` | `npm test` → falha ao importar `@/src/config/env` (módulo inexistente) | `npm test` → 9/9 passaram após criar `src/config/env.ts` |
| Banco (Drizzle) | `npm run test:integration` → falha ao importar `@/db/client` (módulo inexistente) | `npm run test:integration` → 2/2 passaram após schema, cliente e migração `0000_init` |
| E2E | primeira execução falhou por falta do navegador (ambiente, não código); após `npx playwright install chromium` | `npm run test:e2e` → 4/4 passaram (desktop e mobile) |

## Garantias

| # | O que está garantido | Teste | Tipo | Resultado |
|---|---|---|---|---|
| 1 | A página inicial mostra o h1 "Observa" | `tests/unit/home-page.test.tsx` | unit | PASS |
| 2 | A página explica o propósito em uma frase | `tests/unit/home-page.test.tsx` | unit | PASS |
| 3 | Nenhum resto do template do create-next-app | `tests/unit/home-page.test.tsx` | unit | PASS |
| 4 | `DATABASE_URL` postgres:// e postgresql:// são aceitas | `tests/unit/env.test.ts` | unit | PASS |
| 5 | `DATABASE_URL` ausente ou de outro banco falha com mensagem clara | `tests/unit/env.test.ts` | unit | PASS |
| 6 | A mensagem de erro não contém a senha | `tests/unit/env.test.ts` | unit | PASS |
| 7 | A validação devolve objeto novo e ignora variáveis desconhecidas | `tests/unit/env.test.ts` | unit | PASS |
| 8 | Migrações aplicam e uma legislatura é gravada e lida | `tests/integration/db.test.ts` | integração | PASS |
| 9 | O banco recusa legislatura com fim antes do início | `tests/integration/db.test.ts` | integração | PASS |
| 10 | A página carrega com título "Observa" e `lang="pt-BR"` | `tests/e2e/home.spec.ts` | E2E | PASS |
| 11 | Sem rolagem horizontal no desktop e no celular (Pixel 7) | `tests/e2e/home.spec.ts` | E2E | PASS |

## Cobertura

`npm run test:coverage` (unit + integração): 100% em linhas, funções, branches e statements (4 arquivos). `app/layout.tsx` fica fora da cobertura do Vitest porque usa `next/font`; está coberto pelo E2E.

## Revisão (agente ECC `code-reviewer`)

Corrigido e reverificado num checkout limpo (sem `.next/` e `next-env.d.ts`): typecheck, lint, 11 testes com 100% de cobertura, build e 4 E2E com `CI=1` passaram.

| Severidade | Achado | Correção |
|---|---|---|
| HIGH | `tsc` falharia no CI por falta dos tipos de rota gerados pelo Next | script `typecheck` = `next typegen && tsc --noEmit` |
| MEDIUM | teste de integração apagava a tabela inteira de qualquer banco apontado | limpeza só dos ids do teste (57, 99) |
| MEDIUM | `afterAll` escondia o erro real se o `beforeAll` falhasse | `database?.close()` |
| MEDIUM | Postgres local exposto na rede com senha trivial | porta presa a `127.0.0.1` |
| LOW | asserção da regra CHECK aceitava qualquer erro | verifica SQLSTATE `23514` e o nome da constraint |
| LOW | versão do Node não fixada | `engines.node >= 24` |

Adiados para o M2 (quando o app passar a usar o banco): timeouts e reuso de conexão em `db/client.ts` (inclusive com `prepare: false` se houver pooler), Postgres e `DATABASE_URL` no job de E2E, `drizzle.config.ts` falhar com mensagem clara sem `DATABASE_URL`, carregar `.env.local` nos scripts `db:*`, fontes locais em vez de `next/font/google` e fixar actions por SHA.

## Lacunas conhecidas

- `npm run lint` mostra 1 aviso quando a pasta `coverage/` existe localmente (o ESLint lê o relatório gerado). Não afeta o CI. Corrigir exige adicionar `coverage/**` aos ignorados do `eslint.config.mjs`, que o hook `config-protection` do ECC bloqueia; decisão do mantenedor.

- O CI ainda não rodou: o projeto não está num repositório git nem no GitHub.
- Não há checkpoints de commit RED/GREEN, pelo mesmo motivo.
- `npm audit` aponta 4 vulnerabilidades moderadas no `esbuild` antigo usado internamente pelo `drizzle-kit` (ferramenta só de desenvolvimento, não vai para produção). A correção sugerida pelo npm rebaixaria o `drizzle-kit` para uma versão incompatível; acompanhar novas versões.

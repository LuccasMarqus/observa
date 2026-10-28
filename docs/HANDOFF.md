# Passagem de contexto (para quem continuar o projeto)

Última atualização: 28/10/2026. Este arquivo resume o estado do projeto para outra pessoa ou IA continuar sem
reler todo o histórico. Leia também o [README](../README.md), o [brief](../PRODUCT-BRIEF.md) e o
[plano técnico](capabilities/meu-deputado.md).

## O que é

**Observa**: site público (pt-BR) para eleitores acompanharem deputados federais — **como votam, quanto gastam da
cota parlamentar e o que propõem** — sempre com link para a fonte oficial (Dados Abertos da Câmara). Projeto
independente e neutro: sem nota, sem ranking, mesmos critérios para todos, nenhuma cor partidária.

Repositório público: https://github.com/LuccasMarqus/observa (branch `main`, commits direto na main até agora).

## Preferências do dono do projeto

- Responder e escrever em **português do Brasil**.
- O dono pediu explicitamente: **usar sempre as skills/agentes do plugin ECC** (everything-claude-code) em toda
  solicitação — ex.: `tdd-workflow`, `frontend-design-direction`, `make-interfaces-feel-better`,
  `react-reviewer`, `security-reviewer`, `verification-loop`. Fluxo esperado: plano → testes primeiro (TDD) →
  implementação → revisão por agente → corrigir CRITICAL/HIGH → commit.
- Banco de dados: **Supabase** (pedido do dono).
- Commits: Conventional Commits em português (`feat:`, `fix:`, `test:`…), sem linhas de atribuição a IA.
- Pedir confirmação antes de push, publicação ou ações irreversíveis, salvo quando o dono já autorizou na mensagem.

## Regras de segurança e privacidade (não negociáveis)

- **Nunca imprimir, logar ou commitar segredos.** O `.env.local` tem a senha do banco Supabase. Ele é ignorado pela
  regra `.env*` do `.gitignore` (só `.env.example` é versionado). Antes de qualquer commit:
  `git check-ignore -v .env.local` deve mostrar a regra `.env*`. Em 28/10 a linha `!.env.example` tinha sido trocada
  por `!.env.local` por engano e foi revertida — confira de novo.
- Ao diagnosticar o `.env.local`, mostre só formato/contagens, nunca o valor (já houve um vazamento e a senha foi
  trocada).
- **Nenhum dado pessoal real no repositório** (CPF, nomes de terceiros). Fixtures usam valores fictícios
  (ex.: CPF `99999999999`).
- LGPD: CPF de deputado e nome de passageiro são descartados; CPF de fornecedor pessoa física é mascarado
  (`***.456.789-**`), inclusive quando vem embutido no nome do fornecedor.

## Stack

Next.js 16.4 (App Router — **leia `node_modules/next/dist/docs/` antes de codar**, a versão tem mudanças; ver
`AGENTS.md`), React 19, Tailwind CSS v4, TypeScript, Drizzle ORM 0.45 + postgres-js, Zod 4, Vitest (projetos
`unit` e `integration`), Playwright (desktop + Pixel 7), tsx para os jobs.

## Infraestrutura

- **Local:** Postgres 17 via `docker compose up -d --wait db` em `127.0.0.1:54329`. Testes de integração só
  aceitam banco local (guarda em `tests/integration/setup-banco-local.ts`).
- **Supabase:** projeto `glozywwyjxtkycxzifax` (sa-east-1, plano gratuito). RLS ligado em todas as tabelas e
  **sem políticas** (anon/publishable não lê nem escreve; verificado). Migrações em `db/migrations` (0000–0006)
  já aplicadas.
- **A rede da máquina do dono bloqueia as portas 5432/6543**, e o host direto do Supabase é só IPv6. Por isso os
  jobs de ingestão rodam no **GitHub Actions**, não localmente.
- **GitHub Actions:**
  - `ci.yml`: lint, typecheck, unit, integração (Postgres de serviço), build, E2E.
  - `sync.yml`: diário às 09:00 UTC (06:00 Brasília) + `workflow_dispatch` com entradas `votacoes_inicio`,
    `votacoes_fim`, `anos_despesas`. Usa o secret `DATABASE_URL` (pooler do Supabase com `sslmode=require`) e a
    variável `LEGISLATURA` (padrão 57).

## O que está pronto

| Marco | Estado |
|---|---|
| M0 esqueleto (Next, Drizzle, Vitest, Playwright, CI) | pronto |
| M1–M2 cliente da Câmara + `sync-deputados` | pronto |
| M3 `sync-votacoes` (Plenário, votos, orientações) | pronto |
| M4 `sync-despesas` (CSV da cota) + `sync-proposicoes` | pronto |
| Página de apresentação (`/`) com direção visual "documento público" + refinamento moderno-clássico | pronto (commit `7174d30`) |
| M5 métricas (participação, gasto vs. UF) + views | **não iniciado** |
| M6 páginas: busca/lista `/deputados`, perfil, `/metodologia` | **não iniciado** (o botão "Encontrar deputados" da home já aponta para `/deputados`, que ainda dá 404) |
| M7 OG/compartilhar/SEO/Lighthouse · M8 monitoramento | não iniciados |

Evidências de TDD por marco em `docs/tdd/`; contrato visual em `docs/design/direcao-visual.md` e capturas em
`docs/design/evidencias/`.

### Detalhes importantes da API da Câmara (já tratados no código)

- Plenário é `idOrgao=180`; filtros de data aceitam no máximo ~3 meses → o cliente divide em janelas de 90 dias.
- A lista de deputados repete uma linha por partido; o partido atual vem de `ultimoStatus`.
- Votação secreta retorna `tipoVoto: null` (coluna anulável).
- CSV da cota: ~547 linhas de lideranças partidárias, valores negativos de estorno, CPF embutido no nome.
- `sync-despesas` recusa substituir um ano se >1% das linhas forem descartadas ou se o arquivo parecer truncado
  (<90% das linhas já gravadas).
- Jobs são idempotentes; status `sucesso` / `falha_parcial` / `falha` (exit 0 / 2 / 1), registrados em
  `ingestao_execucao`; circuit breaker após 10 falhas.

## Pendências imediatas

1. **Carga histórica no Supabase**: a execução `40689659811` do workflow "Sincronização de dados" estava em
   andamento em 28/10. Conferir o resultado (`gh run view 40689659811 -R LuccasMarqus/observa`) e as contagens
   das tabelas. Esperado: despesas de 2023 como `falha_parcial` (incluem deputados da legislatura anterior que não
   estão em `mandato`) — avaliar se o job deve aceitar isso ou carregar a 56ª legislatura também.
2. **CI do commit `7174d30` falhou** num teste E2E novo ("o cabeçalho fixo não cobre o elemento focado por Tab"):
   no CI o foco caía no `<main tabIndex=-1>`. A correção (ignorar elementos com `tabIndex < 0`) foi feita e passa
   localmente com `CI=1`; confirme o CI verde no próximo push.
3. Achados ainda abertos da última revisão (`react-reviewer`), de prioridade média/baixa:
   - adicionar `@axe-core/playwright` e rodar axe nos temas claro e escuro (precisa instalar dependência);
   - testar reflow em 320 px / zoom 400%;
   - Fraunces com itálico + eixo `opsz` aumenta o peso das fontes — medir LCP/CLS;
   - `openGraph.title` fixo e sem imagem OG (fica para o M7, depende do domínio — questão Q5).

## Próximo passo sugerido

**M6, começando por `/deputados`** (busca e lista com dados reais do banco), seguindo a direção visual existente:
- dados lidos no servidor (Server Components) via `src/repositories/*`; nada de chave do Supabase no cliente;
- filtros por nome, UF e partido na URL (search params), paginação, estados vazio/erro/parcial;
- cada número com fonte e data de atualização;
- depois: perfil `/deputados/[id]` com as abas Votos, Gastos e Projetos, e `/metodologia`.

Para o site ler o Supabase em produção será preciso decidir hospedagem (ex.: Vercel) e como o servidor acessa o
banco (conexão Postgres pelo pooler a partir do servidor, ou políticas RLS de leitura para um papel específico).
Decisões de produto em aberto: Q1–Q6 em `docs/capabilities/meu-deputado.md`.

## Comandos úteis

```bash
npm run lint && npm run typecheck && npm test        # checagens rápidas
npm run test:integration                             # precisa do Postgres local
npm run build && npm run test:e2e                    # build + E2E (o Playwright sobe o servidor)
gh workflow run sync.yml -R LuccasMarqus/observa     # dispara a sincronização no GitHub Actions
```

Classes CSS próprias no Tailwind v4 devem ser declaradas com `@utility` (CSS solto em `@layer components` é
descartado no build). Tokens de cor ficam em `app/globals.css` (`--papel`, `--tinta`, `--petroleo`…), com
variante escura via `prefers-color-scheme`; o anel de foco usa `--cor-foco`.

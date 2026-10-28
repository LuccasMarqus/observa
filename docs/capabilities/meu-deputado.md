# Capacidade: Meu Deputado (MVP do Observa)

> Plano técnico gerado com a skill ECC `product-capability` a partir de [PRODUCT-BRIEF.md](../../PRODUCT-BRIEF.md) em 27/10/2026.
> Campos e endpoints conferidos ao vivo na API da Câmara na mesma data.

## Capacidade

- **Nome:** Meu Deputado
- **Origem:** PRODUCT-BRIEF.md (seção 5, MVP)
- **Ator principal:** eleitor(a) anônimo(a), no celular
- **Resultado após o lançamento:** qualquer pessoa encontra seu deputado federal e entende, em até 2 minutos, como ele vota, quanto gasta e o que propõe, com fonte oficial em cada número.
- **Sinal de sucesso:** ≥ 2 perfis vistos por visitante, ≥ 20% de retorno em 30 dias, ≥ 5 compartilhamentos a cada 100 visitas.

## Intenção de produto (promessa visível ao usuário)

"Busque seu deputado federal pelo nome ou estado e veja, em linguagem simples, como ele votou, quanto gastou da cota parlamentar e quais projetos apresentou — tudo com link para a fonte oficial e data de atualização."

## Restrições

### Regras fixas (política do produto — não negociáveis)

1. **Todo número exibido tem fonte e data.** Sem fonte rastreável, o dado não aparece.
2. **Mesmos critérios para todos os deputados.** Nenhuma regra, filtro ou destaque pode depender de partido ou pessoa.
3. **Sem nota, selo ou ranking opinativo** ("bom/mau"). Comparações são só numéricas (ex.: gasto vs. média da UF) e com a metodologia linkada.
4. **Não exibir nem armazenar CPF**, mesmo que a API o retorne (`/deputados/{id}` traz `cpf`). Descartar na ingestão.
5. **Site somente leitura e sem login** no MVP. Nenhum dado pessoal de visitantes além de analytics agregado sem cookies.

### Invariantes de dados

- Um deputado é identificado pelo `id` da Câmara (estável entre legislaturas).
- Partido e UF pertencem ao **mandato** (deputado × legislatura), não ao deputado: as pessoas trocam de partido.
- Voto só existe em **votação nominal**. Votações simbólicas não têm votos individuais (confirmado: `/votacoes/{id}/votos` vem vazio) e não entram em métricas por deputado.
- Valores de despesa usam o **valor líquido** (`valorLiquido`) e ficam em centavos (inteiro) no banco.
- Ingestão é **idempotente**: rodar duas vezes o mesmo período não duplica linhas (upsert por chave natural).

### Restrições de fonte (o que a API realmente oferece)

| Necessidade | Fonte escolhida | Observação |
|---|---|---|
| Lista e perfil de deputados | API `GET /deputados`, `GET /deputados/{id}` | 513 em exercício, paginada, sem chave |
| Despesas da cota (CEAP) | **Arquivo em lote** `camara.leg.br/cotas/Ano-AAAA.csv.zip` | O endpoint `/deputados/{id}/despesas` retornou vazio nos testes; o arquivo anual respondeu 200 |
| Votações e votos nominais | **Arquivos em lote** `dadosabertos.camara.leg.br/arquivos/votacoesVotos/...` + API `GET /votacoes?idOrgao=180` (Plenário) para incrementais | `siglaOrgao=PLEN` é rejeitado; usar `idOrgao=180` |
| Orientação de bancada | API `GET /votacoes/{id}/orientacoes` | Permite mostrar "votou com/contra a orientação do partido" |
| Proposições de autoria | API `GET /proposicoes?idDeputadoAutor={id}` | Filtrar por tipos PL, PEC, PLP no MVP |
| Legislaturas | API `GET /legislaturas` | 57ª termina em 31/01/2027; 58ª começa em 01/02/2027 |

> **Presença em plenário:** a API v2 não expõe presença de forma direta. O MVP mostra **"participação em votações nominais"** (votos registrados ÷ votações nominais no Plenário enquanto em exercício), com o nome exato e explicação na metodologia. Não chamar de "presença".

### Restrições de rollout

- Desenvolver com os dados da 57ª legislatura (já completos).
- Ver a questão em aberto Q1 sobre a virada para a 58ª legislatura.

## Atores e superfícies

| Ator | Superfície |
|---|---|
| Eleitor(a) | Páginas públicas (web responsiva) |
| Redes sociais (WhatsApp, Instagram, X) | Imagem Open Graph por deputado |
| Mantenedor(a) | Jobs de ingestão, log de execuções, alertas de falha |
| Pessoa que reporta erro | Link "reportar erro" → issue/formulário (sem login) |

### Páginas (UI)

| Rota | Conteúdo |
|---|---|
| `/` | Busca por nome + seletor de UF + explicação em uma frase |
| `/deputados?uf=MG&partido=` | Lista filtrável com foto, nome, partido, UF |
| `/deputado/[id]-[slug]` | Perfil: cabeçalho, 3 cartões-resumo, abas Votos / Gastos / Projetos |
| `/metodologia` | Como cada número é calculado, fontes, frequência de atualização |
| `/sobre` | Princípios editoriais, neutralidade, código aberto, contato |
| `/api/og/[id]` | Imagem 1200×630 para compartilhamento |

### Perfil — conteúdo mínimo

1. **Cabeçalho:** foto, nome eleitoral, partido atual, UF, situação, legislatura.
2. **Cartões-resumo:**
   - Participação em votações nominais (% e comparação com a média da UF).
   - Gasto da cota no ano (R$ e posição entre os deputados da UF).
   - Proposições apresentadas na legislatura (contagem por tipo).
3. **Aba Votos:** lista das votações nominais no Plenário, com ementa em linguagem simples, voto (Sim/Não/Abstenção/Obstrução/Não votou) e orientação do partido.
4. **Aba Gastos:** total por categoria e por mês, com os maiores fornecedores e link para o documento fiscal quando existir.
5. **Aba Projetos:** proposições de autoria, com ementa e situação.
6. **Rodapé de cada bloco:** "Fonte: Câmara dos Deputados · atualizado em DD/MM/AAAA".

## Estados e transições

### Mandato

`em_exercicio → licenciado → em_exercicio`
`em_exercicio → fim_de_mandato`
`suplente → em_exercicio` (quando assume)

A situação vem de `ultimoStatus.situacao` da API; o perfil sempre mostra o estado atual e o período coberto pelas métricas.

### Execução de ingestão

`agendada → rodando → sucesso | falha_parcial | falha`

- `falha_parcial`: alguma fonte falhou; as demais são gravadas. O site continua mostrando os dados anteriores dessa fonte com a data antiga visível.
- `falha`: nada é gravado (transação). Alerta para o mantenedor.

## Contrato de interface

### Ingestão (jobs)

| Job | Frequência | Entrada | Saída | Chave de upsert |
|---|---|---|---|---|
| `sync-deputados` | diária | API `/deputados` + detalhe | `deputado`, `mandato` | `deputado.id`, `(deputado_id, legislatura_id)` |
| `sync-votacoes` | diária | API `/votacoes?idOrgao=180` desde a última execução; carga inicial por arquivo | `votacao`, `voto`, `orientacao` | `votacao.id`, `(votacao_id, deputado_id)` |
| `sync-despesas` | semanal | CSV anual da cota (ano atual + anterior) | `despesa` | hash das colunas identificadoras do documento |
| `sync-proposicoes` | diária | API `/proposicoes?idDeputadoAutor=` | `proposicao`, `autoria` | `proposicao.id`, `(proposicao_id, deputado_id)` |
| `refresh-agregados` | após cada sync | banco | views materializadas das métricas | — |

**Requisitos comuns dos jobs:**
- Respeitar a API: no máximo ~5 requisições/s, retry com backoff exponencial (3 tentativas) em 429/5xx, timeout de 30 s.
- Validar cada resposta com schema (Zod) antes de gravar; registro inválido vai para o log, não para o banco.
- Registrar cada execução em `ingestao_execucao` (início, fim, status, contagens, erro).

### Leitura (site)

- Páginas renderizadas no servidor e cacheadas (ISR, revalidação a cada 6 h e sob demanda após a ingestão).
- Sem API pública no MVP. As páginas leem o banco por uma camada de repositório (`DeputadoRepository`, `VotacaoRepository`…).

### Estados de falha visíveis

- Deputado não encontrado → 404 com busca.
- Bloco sem dados (ex.: suplente sem votos) → mensagem explicativa, nunca "0" enganoso.
- Dado defasado (> 7 dias) → aviso "dados de DD/MM; a fonte oficial está instável".

## Implicações de dados

**Fonte da verdade:** Câmara dos Deputados. O banco do Observa é um **cache derivado**: pode ser apagado e reconstruído pelos jobs.

### Modelo (PostgreSQL)

```
legislatura(id PK, data_inicio, data_fim)
deputado(id PK, nome_civil, nome_eleitoral, sexo, data_nascimento, uf_nascimento,
         municipio_nascimento, escolaridade, url_foto, atualizado_em)
mandato(deputado_id FK, legislatura_id FK, sigla_partido, sigla_uf, situacao,
        condicao_eleitoral, PK(deputado_id, legislatura_id))
votacao(id PK text, data, data_hora_registro, id_orgao, descricao, aprovacao,
        proposicao_id FK null, nominal bool)
voto(votacao_id FK, deputado_id FK, tipo_voto, sigla_partido_na_data, PK(votacao_id, deputado_id))
orientacao(votacao_id FK, sigla_bancada, orientacao, PK(votacao_id, sigla_bancada))
proposicao(id PK, sigla_tipo, numero, ano, ementa, ementa_simplificada null,
           data_apresentacao, situacao)
autoria(proposicao_id FK, deputado_id FK, ordem, proponente bool, PK(proposicao_id, deputado_id))
despesa(hash PK, deputado_id FK, ano, mes, categoria, fornecedor, cnpj_cpf_fornecedor,
        valor_liquido_centavos bigint, data_documento, url_documento)
ingestao_execucao(id PK, job, iniciado_em, finalizado_em, status, registros_lidos,
                  registros_gravados, erro)
```

- `sigla_partido_na_data` em `voto` congela o partido no momento do voto, evitando reescrever o histórico quando alguém troca de partido.
- `cnpj_cpf_fornecedor`: fornecedores pessoa física aparecem na fonte oficial. **Questão em aberto Q4** sobre exibir ou mascarar.
- Retenção: guardar todas as legislaturas ingeridas; nada é apagado no MVP.

## Segurança e política

- **Superfície pequena:** sem login, sem formulários que gravem no banco, sem upload.
- Usuário do banco para o site **somente leitura**; os jobs usam outro usuário com escrita.
- Segredos (URL do banco) só em variáveis de ambiente; `.env.example` sem valores.
- Cabeçalhos: CSP restritiva, HSTS, `X-Content-Type-Options`.
- **Abuso:** scraping do próprio site é aceitável (dados públicos), mas há rate limit na rota de imagem OG, que é a mais cara.
- **Governança editorial:** qualquer lista curada (ex.: "votações em destaque") fica num arquivo versionado no repositório, com critério público e histórico de mudanças.
- **Legislação eleitoral:** sem impacto no MVP (não é período eleitoral até 2028), mas o conteúdo não pode configurar propaganda. Revisão jurídica antes de 2028.
- **Textos gerados por IA** (ementas simplificadas, fase posterior): sempre marcados como "resumo automático" e acompanhados da ementa oficial.

## Arquitetura e stack

| Camada | Escolha | Motivo |
|---|---|---|
| Web | Next.js (App Router) + TypeScript + Tailwind | SSR/ISR bom para SEO e cards de compartilhamento |
| Banco | PostgreSQL gerenciado (Neon ou Supabase, plano gratuito) | Relacional combina com o modelo; views materializadas para métricas |
| ORM / migrações | Drizzle | Tipado e migrações em SQL legível |
| Validação | Zod | Validar as respostas das APIs externas |
| Ingestão | Scripts Node/TS em `jobs/`, agendados pelo GitHub Actions (cron) | Custo zero, logs visíveis, fácil rodar localmente |
| Testes | Vitest (unitário/integração) + Playwright (E2E) + Testcontainers ou Postgres local | Cobertura ≥ 80% (regra do ECC) |
| Hospedagem | Vercel | Integração nativa com Next.js e imagens OG |

### Estrutura de pastas

```
observa/
├── app/                    # rotas Next.js
│   ├── deputado/[slug]/
│   ├── deputados/
│   ├── metodologia/
│   └── api/og/[id]/
├── src/
│   ├── domain/             # tipos e cálculos puros (participação, ranking de gasto)
│   ├── repositories/       # acesso ao banco
│   ├── sources/camara/     # cliente HTTP + schemas Zod + parsers de CSV
│   └── ui/                 # componentes
├── jobs/                   # sync-deputados.ts, sync-votacoes.ts, ...
├── db/                     # schema Drizzle + migrações
├── content/destaques.yml   # votações em destaque (curadoria versionada)
├── tests/{unit,integration,e2e}/
└── docs/
```

## Plano de execução (marcos)

Cada marco segue o `tdd-workflow`: teste primeiro, implementação mínima e depois refatoração.

| # | Marco | Pronto quando |
|---|---|---|
| M0 | Esqueleto do projeto: Next.js, Drizzle, Vitest, Playwright, CI no GitHub Actions | CI verde com um teste de fumaça |
| M1 | Cliente da Câmara + schemas Zod + fixtures gravadas de respostas reais | Testes unitários dos parsers passam offline |
| M2 | Banco + `sync-deputados` idempotente | Rodar 2× gera 513 mandatos da 57ª, sem duplicar |
| M3 | `sync-votacoes` (carga em lote + incremental) + orientações | Votos de uma votação nominal conhecida conferem com o site da Câmara |
| M4 | `sync-despesas` (CSV) + `sync-proposicoes` | Total anual de um deputado de amostra confere com o painel oficial |
| M5 | Métricas no domínio (participação, gasto vs. UF) + views materializadas | Testes unitários cobrem casos-limite: suplente, licenciado, sem votos |
| M6 | Páginas: busca, lista, perfil, metodologia | E2E: buscar → abrir perfil → ver as 3 abas com fonte |
| M7 | Imagem OG + compartilhar + acessibilidade (WCAG AA) + SEO | Lighthouse ≥ 90 em mobile; card renderiza no WhatsApp |
| M8 | Monitoramento: alerta de falha de ingestão, aviso de dado defasado | Falha simulada gera alerta e o aviso aparece no site |

## Não objetivos

- Senadores, deputados estaduais e vereadores (fase 2+).
- Dados do TSE (patrimônio, financiamento) — fase 2.
- Painéis de educação, saúde, segurança e economia — fase 3.
- Promessas de campanha, alertas por e-mail ou push, contas de usuário.
- Resumos por IA (ficam preparados no schema, com `ementa_simplificada`, mas desligados).
- API pública do Observa.
- App nativo.

## Questões em aberto (decisões de produto)

| # | Questão | Por que bloqueia | Sugestão |
|---|---|---|---|
| Q1 | **Lançar com a 57ª legislatura (que termina em 31/01/2027) ou esperar a 58ª?** | Os eleitos em out/2026 só entram na API a partir de 01/02/2027 | Desenvolver com a 57ª e lançar em fev/2027 com a 58ª, mantendo a 57ª como "mandato anterior" (vira prestação de contas de quem se reelegeu) |
| Q2 | Quais votações entram como "destaque" no perfil? | Curadoria pode parecer viés | Mostrar **todas** as nominais em ordem cronológica; "destaques" só com critério objetivo (ex.: PECs + votações com quórum alto) documentado em `/metodologia` |
| Q3 | Mostrar "votou com/contra o partido"? | Pode ser lido como julgamento | Mostrar como fato neutro, com a orientação ao lado |
| Q4 | Exibir CPF de fornecedores pessoa física nas despesas? | LGPD versus transparência (o dado é público na fonte) | Mascarar no MVP (`***.123.456-**`) e linkar para a fonte oficial |
| Q5 | Domínio e nome jurídico (pessoa física, associação ou ONG)? | Necessário para hospedagem, termos de uso e responsabilidade | Decidir antes do M7 |
| Q6 | Código aberto desde o início? | Reforça a neutralidade; exige cuidado com segredos | Sim, com licença AGPL ou MIT — decidir no M0 |

## Handoff

- **Pronto para implementar?** Sim para M0–M5 (independem das questões em aberto). M6+ dependem de Q1–Q4.
- **Precisa de revisão de arquitetura?** Leve: validar a stack com o agente `architect` antes do M0.
- **Precisa de esclarecimento de produto?** Sim: Q1–Q6.
- **Próxima trilha ECC:** `tdd-workflow` para M0–M5 → `frontend-design-direction` para M6 → `verification-loop` e `browser-qa` antes de lançar.

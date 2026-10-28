# TDD — M1 (cliente da Câmara) e M2 (sync de deputados)

> Relatório de evidências da skill ECC `tdd-workflow`. Data: 27/10/2026.

## Plano de origem

Marcos M1 e M2 de [docs/capabilities/meu-deputado.md](../capabilities/meu-deputado.md):

- **M1:** cliente da Câmara + schemas Zod + fixtures gravadas de respostas reais. Pronto quando os testes dos parsers passam offline.
- **M2:** banco + `sync-deputados` idempotente. Pronto quando rodar 2× gera os mandatos da 57ª sem duplicar.

## Jornadas

- Como mantenedor(a), quero baixar os deputados de uma legislatura com um comando e poder repeti-lo sem duplicar dados.
- Como mantenedor(a), quero que falhas pontuais da API não derrubem o job inteiro e fiquem registradas.
- Como eleitor(a), quero ver o partido **atual** do deputado, mesmo que ele tenha trocado de partido.

## Fatos descobertos na API real (27/10/2026)

| Fato | Consequência no código |
|---|---|
| `siglaOrgao=PLEN` é rejeitado; o Plenário é `idOrgao=180` | `listVotacoesPlenario` usa `idOrgao=180` |
| Filtro de votações aceita no máximo 3 meses | `splitDateRange` divide em janelas de 90 dias |
| A API envia `Retry-After` e limita o ritmo com 429 | o cliente respeita `Retry-After` |
| `siglaTipo` pode ser repetido (`siglaTipo=PL&siglaTipo=PEC`) | `listProposicoesPorAutor` envia um por tipo |
| A lista da legislatura 57 tem **882 linhas para 648 pessoas**: uma linha por partido em que o deputado esteve | partido do mandato vem do `ultimoStatus` quando ele é da legislatura |
| Votações simbólicas não têm votos individuais | fixture de votos usa uma votação nominal (2236186-60) |
| O detalhe do deputado traz CPF | o schema descarta o campo; o fixture tem CPF sintético |

## Ciclos RED → GREEN

| Alvo | RED | GREEN |
|---|---|---|
| Schemas Zod | `npm test` → import de `@/src/sources/camara/schemas` inexistente | 20/20 |
| `splitDateRange` | import inexistente | 43/43 (com cliente) |
| Cliente HTTP | import inexistente | 43/43 |
| `syncDeputados` | import inexistente | 53/53 |
| Repositório (Postgres) | `npm run test:integration` → import inexistente | 8/8 |
| **Bug: partido antigo gravado** (achado no sync real) | 2 testes falharam com a regra corrigida | 54/54 |
| **Bug: timeout não cobria o corpo da resposta** | teste travou até o limite de 3 s | 55/55 |
| Conflito de ids entre teste e dados reais (achado na verificação) | `test:coverage` → FK de `mandato` ao apagar legislatura 57 | 63/63 após mover o teste para ids 9xx |

## Execução real

`npx tsx jobs/sync-deputados.ts 57` contra a API da Câmara e o Postgres local:

| Execução | Resultado | Tempo |
|---|---|---|
| 1ª | `sucesso`, 648 lidos, 648 gravados | 2 min 24 s |
| 2ª (após correção do partido) | `sucesso`, 648/648; continuam 648 deputados e 648 mandatos; partidos corrigidos (ex.: 220714 REPUBLICANOS → MDB) | ~11 min (API limitou o ritmo com 429; o cliente esperou e concluiu) |

Situação dos 648 mandatos: 513 em exercício (igual ao total atual da API), 103 suplência, 24 vacância, 8 licença.

## Garantias principais

| # | Garantia | Teste | Tipo |
|---|---|---|---|
| 1 | Respostas reais da API são lidas sem erro | `tests/unit/camara/schemas.test.ts` | unit |
| 2 | CPF nunca sai do parser | `schemas.test.ts`, `client.test.ts` | unit |
| 3 | Paginação segue `next` só dentro da API e tem limite de páginas | `client.test.ts` | unit |
| 4 | 429/5xx/rede/timeout são retentados com backoff; 400 não | `client.test.ts` | unit |
| 5 | Timeout cobre cabeçalhos e corpo | `client.test.ts` | unit |
| 6 | Id de votação é codificado na URL (sem path traversal) | `client.test.ts` | unit |
| 7 | Períodos longos viram janelas de até 90 dias | `date-ranges.test.ts`, `client.test.ts` | unit |
| 8 | Partido atual vem do último status da legislatura | `tests/unit/ingest/sync-deputados.test.ts` | unit |
| 9 | Falha de um deputado vira `falha_parcial`; lista indisponível vira `falha` | `sync-deputados.test.ts` | unit |
| 10 | Upserts idempotentes; um mandato por legislatura | `tests/integration/deputados-repository.test.ts` | integração |
| 11 | Deputado não é gravado se o mandato falhar (transação) | `deputados-repository.test.ts` | integração |
| 12 | Log de execução registra início e fim com contagens | `deputados-repository.test.ts` | integração |

## Revisões (agentes ECC `code-reviewer` e `security-reviewer`)

Sem achados CRITICAL. Corrigido com teste antes (RED: 16 testes falhando; GREEN: 71/71):

| Severidade | Achado | Correção |
|---|---|---|
| HIGH | Sem disjuntor: com a API fora do ar o job falharia deputado por deputado por horas | para após 10 falhas seguidas (`MAX_FALHAS_SEGUIDAS`) |
| MEDIUM | Redirecionamento 3xx levaria o job a outro host sem checagem (SSRF) | `redirect: "error"` |
| MEDIUM | `urlFoto` livre iria para `<img>` no site | só `https://` de `*.camara.leg.br`; o resto vira nulo |
| MEDIUM | Lista vazia da API virava "sucesso" | vira `falha` com mensagem |
| MEDIUM | Partido arbitrário quando o status é de outra legislatura (mudaria entre execuções) | partido nulo quando ambíguo |
| MEDIUM | Falha ao registrar o fim reclassificava dados gravados como falha | `finish` fora do `try`; o erro sobe |
| MEDIUM | `Retry-After` sem teto | máximo de 60 s |
| LOW | `/api/v2evil` passava na checagem de caminho | fronteira de caminho exata |
| LOW | Id de votação sem formato | `^[\w-]+$` |
| LOW | `sql.raw` frágil no upsert | `sql.identifier` |
| LOW | `2026-02-30` era aceita | validação de ida e volta da data |
| LOW | Campos não usados derrubariam a lista se faltassem | `nullish` |
| LOW | Causa das falhas ficava só no stdout | primeira mensagem de erro gravada no log |

Conferido contra a API real depois das correções: foto preservada, sem CPF, 182 votações do Plenário (ago–out/2026), 429 votos, 15 orientações, 79 proposições, 882 registros da lista todos com foto válida.

Adiados (dependem do workflow agendado e do banco hospedado): `concurrency` e `timeout-minutes` no workflow do cron, tratamento de SIGTERM, `prepare: false` se houver pooler, TLS obrigatório fora de localhost, papel somente leitura para o site, migrações em passo separado, teto de tamanho de resposta, actions fixadas por SHA.

## Cobertura

`npm run test:coverage` (unit + integração): 79 testes; statements 97,08%, branches 93,65%, funções 93,15%, linhas 98,59%. `jobs/` (CLI) fica fora da cobertura e foi verificado pela execução real.

## Lacunas conhecidas

- O job ainda não está agendado no GitHub Actions: depende de um banco hospedado e do segredo `DATABASE_URL` (questão Q5 do plano).
- Os dados locais foram gravados antes das correções da revisão; o próximo sync os atualiza (as regras novas só tornam campos mais restritos).
- Sem checkpoints de commit RED/GREEN: o projeto ainda não é um repositório git.

# TDD — M3: votações do Plenário, votos e orientações

> Relatório de evidências da skill ECC `tdd-workflow`. Data: 27/10/2026.

## Plano de origem

Marco M3 de [docs/capabilities/meu-deputado.md](../capabilities/meu-deputado.md): "`sync-votacoes` (carga em lote + incremental) + orientações. Pronto quando os votos de uma votação nominal conhecida conferem com o site da Câmara."

## Jornadas

- Como eleitor(a), quero ver como meu deputado votou em cada votação nominal do Plenário e qual foi a orientação do partido.
- Como mantenedor(a), quero baixar as votações de um período com um comando, repetível sem duplicar.

## Fatos descobertos na API real

| Fato | Consequência |
|---|---|
| Votação **secreta** vem com `tipoVoto: null` em todos os votos (ex.: 2645346-18, indicação ao TCU) | `tipoVoto` nulo = voto secreto; a presença conta, o voto não é inventado |
| Tipo `"Artigo 17"` = presidente da sessão | guardado como veio; tratamento na métrica fica para o M5 |
| Orientações vêm por partido (`P`) e por bloco/governo/oposição (`B`, ex.: "Fdr PT-PCdoB-PV") | `tipo_lideranca` guardado para o M5 casar partido × orientação |
| Votações simbólicas não têm votos (171 de 182 no período) | registradas com `nominal = false`; não busca orientação (economiza requisição) |
| Data/hora vem no horário de Brasília, sem fuso | coluna `timestamp` sem fuso, guardada como veio |

## Ciclos RED → GREEN

| Alvo | RED | GREEN |
|---|---|---|
| Helper de lote (`src/ingest/lote.ts`) | import inexistente | 82/82 |
| Refactor do `sync-deputados` para usar o helper | — (refactor; testes existentes como rede) | 82/82 |
| `syncVotacoes` | import inexistente | 90/90 |
| Repositório de votações | import inexistente (integração) | 12/12 |
| **Votação secreta** (achada na execução real: 1 de 182 falhou com 466 erros de schema) | 1 teste unitário falhou + `tsc` acusou a coluna `NOT NULL` | 91/91 unit, 13/13 integração; migração `0003_voto_secreto` |

## Execução real

`npx tsx jobs/sync-votacoes.ts 2026-08-01 2026-10-27`:

| Execução | Resultado |
|---|---|
| 1ª | `falha_parcial`: 181/182 (a votação secreta falhou na validação) — ~1 min 10 s |
| 2ª (após correção) | `sucesso`: 182/182; 11 nominais, 171 simbólicas; 4.481 votos; 170 orientações; 0 votos duplicados |

**Conferência com a fonte oficial:** votação 2236186-60 — banco: Sim 252, Não 176, Artigo 17 1. Descrição oficial da Câmara: "Sim: 252; Não: 176; Total: 428" (+ presidente). Confere.

## Garantias principais

| # | Garantia | Teste | Tipo |
|---|---|---|---|
| 1 | Votação nominal grava votos e orientações | `sync-votacoes.test.ts`, `votacoes-repository.test.ts` | unit, integração |
| 2 | Votação simbólica grava sem votos e sem buscar orientações | `sync-votacoes.test.ts`, `votacoes-repository.test.ts` | unit, integração |
| 3 | Rodar de novo substitui votos e orientações sem duplicar | `votacoes-repository.test.ts` | integração |
| 4 | Voto de deputado não sincronizado falha com mensagem clara e não grava nada | `votacoes-repository.test.ts` | integração |
| 5 | Voto secreto (tipo nulo) é aceito e gravado | `schemas.test.ts`, `votacoes-repository.test.ts` | unit, integração |
| 6 | Período sem votações (recesso) é sucesso | `sync-votacoes.test.ts` | unit |
| 7 | Disjuntor para após 10 falhas seguidas | `lote.test.ts`, `sync-votacoes.test.ts` | unit |

## Revisão (agente ECC `code-reviewer`)

Sem CRITICAL nem HIGH. Corrigido com teste antes (RED: 7 testes; GREEN: 94 unit + 15 integração):

| Severidade | Achado | Correção |
|---|---|---|
| MEDIUM | Resposta vazia da API apagaria os votos de uma votação nominal já gravada e a rebaixaria a simbólica, sem aviso | repositório recusa o rebaixamento e mantém os dados anteriores |
| MEDIUM | Deputado não sincronizado (problema de dado) contava como "fonte fora do ar" no disjuntor e parava o job | `ErroDeDado` não conta para o disjuntor; a mensagem lista os ids que faltam |
| LOW | "Interrompido" aparecia mesmo sem itens pulados | só marca interrompido quando sobram itens |
| LOW | Partido e bloco com a mesma sigla: um era descartado | tipo de liderança na chave (migração `0004_orientacao_pk`) |
| LOW | Votação repetida entre janelas inflava as contagens | lista deduplicada por id |

Adiado: lock da migração quando dois jobs começam juntos (o plano é migrar num passo separado do deploy).

Reexecução real após as correções: `sucesso`, 182/182; 4.481 votos e 170 orientações (mesmos totais, sem duplicar).

## Cobertura

`npm run test:coverage`: 109 testes; statements 96,76%, branches 95%, funções 92,38%, linhas 97,74%.

## Lacunas conhecidas

- Carga histórica da legislatura inteira (2023–2026) ainda não executada; o período testado foi ago–out/2026.
- Sem agendamento automático (depende de banco hospedado, questão Q5).

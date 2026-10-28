# TDD — M4: despesas da cota parlamentar e proposições

> Relatório de evidências da skill ECC `tdd-workflow`. Data: 27/10/2026.

## Plano de origem

Marco M4 de [docs/capabilities/meu-deputado.md](../capabilities/meu-deputado.md): "`sync-despesas` (CSV) + `sync-proposicoes`. Pronto quando o total anual de um deputado de amostra confere com o painel oficial."

## Jornadas

- Como eleitor(a), quero ver quanto meu deputado gastou da cota, por categoria e fornecedor, com link para o documento fiscal.
- Como eleitor(a), quero ver os projetos (PL, PEC, PLP) que meu deputado apresentou na legislatura.
- Como pessoa física que vendeu para um gabinete, não quero meu CPF exposto.

## Fatos descobertos nos dados reais

| Fato | Consequência |
|---|---|
| `Ano-2026.csv.zip`: 4,4 MB; CSV de 45 MB, 118.851 linhas, UTF-8 com BOM, separador `;` | parser com `csv-parse` (biblioteca consolidada), download com limites |
| `ideDocumento` **não** é único (ex.: telefonia sem documento) | chave = sha256 de colunas identificadoras; única nas 118.851 linhas |
| 547 linhas de lideranças, sem deputado | ignoradas e contadas |
| 565 valores negativos (estornos); ponto decimal | centavos inteiros, sem ponto flutuante |
| Colunas `cpf` (deputado) e `txtPassageiro` (terceiros) | nunca saem do parser |
| 1.234 fornecedores pessoa física (CPF em `txtCNPJCPF`) | documento mascarado `***.456.789-**` |
| **377 linhas com CPF colado ao nome do fornecedor** (achado pela revisão de segurança) | `limparNomeFornecedor` remove sequências de CPF; CNPJ é mantido |
| API de proposições recusa filtro de datas > 3 meses | filtro local pela data de apresentação dentro da legislatura |

## Ciclos RED → GREEN

| Alvo | RED | GREEN |
|---|---|---|
| Parser de cotas (`cotas.ts`) | import inexistente | 117/117 |
| Download do zip (`cotas-download.ts`) | import inexistente | 125/125 |
| `syncDespesas`, `syncProposicoes` | import inexistente | 138/138 |
| Repositórios (Postgres) | import inexistente | 23/23 integração |
| Correções das revisões (segurança + código) | 16 testes falhando | 162 unit + 24 integração |

## Execução real

| Job | Resultado | Tempo |
|---|---|---|
| `sync-despesas 2026` | `sucesso`: 118.304 despesas gravadas, 0 ignoradas | ~21 s |
| `sync-despesas 2026` (após correções) | `sucesso`: 118.304; 0 CPFs no nome e 0 sem máscara (antes: 377 no nome) | ~20 s |
| `sync-proposicoes 57` | `sucesso`: 648/648 deputados; 22.025 proposições; 39.524 autorias | 7 min 14 s |

**Conferências com as fontes oficiais:**

- Deputado 204379, 2026: **147 lançamentos, R$ 308.272,30**, igual no banco, no CSV oficial e no JSON oficial (dois formatos publicados pela Câmara).
- Deputado 204379, proposições na legislatura 57: **55 (33 PL, 22 PEC)**, igual no banco e na API.

## Revisões ECC

### `security-reviewer`: 2 HIGH, corrigidos

| Severidade | Achado | Correção |
|---|---|---|
| HIGH | CPF completo colado ao nome do fornecedor ia para o banco (377 linhas reais) | `limparNomeFornecedor`; ano reprocessado; 0 restantes |
| HIGH | Fixture com nome e CPF reais de pessoa física | nomes sintéticos; projeto ainda não versionado, nada publicado |
| MEDIUM | Limite de bytes só checado após baixar tudo | leitura em stream, aborta ao passar do limite |
| MEDIUM | `originalSize` do zip pode mentir | confere o tamanho real após descompactar |
| MEDIUM | Chave sha256 incluía o CPF bruto (força bruta possível) | chave usa o documento já mascarado |
| MEDIUM | Mensagem de erro reproduzia o valor da fonte | mensagens só com o nome do campo |
| LOW | URL com credenciais embutidas aceita | recusada; URL devolvida normalizada |

### `code-reviewer`: sem CRITICAL/HIGH

| Severidade | Achado | Correção |
|---|---|---|
| MEDIUM | Linha de outro ano no arquivo quebraria a substituição | descartada e avisada |
| MEDIUM | Duplicadas/inválidas mudavam o total sem aviso | avisadas; acima de 1% o ano não é substituído |
| MEDIUM | Arquivo truncado trocaria o ano por um parcial | recusa se < 90% das linhas já gravadas |
| LOW | Data inexistente (30/02) derrubaria o ano inteiro no INSERT | vira nula |
| LOW | Proposição repetida na paginação quebraria o upsert | deduplicada |

Adiados: distinguir ex-deputado de outra legislatura nos anos de virada (hoje vira `falha_parcial`); remover autorias que a fonte retirar; contar proposições sem data (0 no caso conferido). Para o M6: rotular como "autoria/coautoria", porque um PL com vários autores conta para cada um.

## Cobertura

`npm run test:coverage`: 186 testes; statements 96,32%, branches 92,91%, funções 92,68%, linhas 97,28%.

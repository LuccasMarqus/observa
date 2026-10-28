# Observa — Product Brief

> Gerado com a skill ECC `product-lens` (Modo 1: diagnóstico de produto) em 27/10/2026.

## 1. Para quem é?

**Público principal:** a pessoa eleitora comum que votou em alguém e quer saber, em 2 minutos e pelo celular, *"o que essa pessoa está fazendo com o meu voto?"*

Persona inicial: Ana, 34 anos, de Belo Horizonte, votou num deputado federal em outubro de 2026. Não sabe onde procurar, não entende o site da Câmara e desconfia de prints no WhatsApp.

**Públicos secundários (depois):** jornalistas locais, professores, ONGs de controle social, criadores de conteúdo político.

## 2. Qual é a dor?

- Os dados existem (Câmara, Senado, TSE, Portal da Transparência, IBGE, INEP, DATASUS), mas estão **espalhados, técnicos e sem contexto**.
- A maioria das pessoas esquece em quem votou para deputado poucos meses depois da eleição.
- O que circula sobre políticos vem de redes sociais polarizadas, sem fonte verificável.
- Hoje a pessoa ou não acompanha nada, ou depende de influenciadores.

## 3. Por que agora?

- **As eleições de 2026 acabaram de acontecer.** Os novos mandatos começam em janeiro (presidente e governadores) e fevereiro de 2027 (Congresso). É o momento de "zerar o placar" e acompanhar desde o primeiro dia.
- As APIs públicas estão maduras e gratuitas (a da Câmara não exige chave).
- IA permite resumir projetos de lei e votações em linguagem simples, algo que antes exigia uma redação inteira.

## 4. Versão 10 estrelas (sem limite de tempo/dinheiro)

- Perfil de **todo** político eleito (federal, estadual, municipal) com votações, presença, gastos, projetos, patrimônio declarado e financiadores de campanha.
- **Promessas de campanha vs. ações**, com acompanhamento de cada promessa.
- Painéis de **educação, saúde, segurança e economia** por município/estado/país, ligados a quem governa cada esfera.
- Alertas: "seu deputado votou hoje no projeto X".
- Comparador: "como meu deputado vota vs. a média do estado / do partido".
- Explicações em linguagem simples geradas por IA, sempre com link para a fonte oficial.

## 5. MVP (menor coisa que prova a tese)

**"Meu Deputado"** — só deputados federais, só dados da API da Câmara.

1. Busca por nome ou estado.
2. Perfil com: presença em plenário, gastos da cota parlamentar (com ranking no estado), proposições apresentadas e como votou nas votações nominais mais relevantes.
3. Cada número com link para a fonte oficial e data de atualização.
4. Botão "compartilhar" (imagem/card para WhatsApp e Instagram).

Por que começar aqui: uma única fonte, gratuita, sem chave, com dados por indivíduo e 513 perfis — escopo pequeno o bastante para lançar em semanas.

**Fase 2:** senadores (API do Senado) + patrimônio e financiamento de campanha (TSE).
**Fase 3:** painéis temáticos (educação, saúde, segurança, economia) ligados ao Executivo.
**Fase 4:** promessas vs. ações, alertas, deputados estaduais e vereadores.

## 6. Anti-objetivos (o que NÃO vamos construir)

- **Nota ou ranking "bom/mau político" opinativo.** Mostramos dados e metodologia; o julgamento é do cidadão.
- **Atribuir indicadores sociais a um parlamentar individual.** A taxa de homicídios de um estado não é "culpa" de um deputado. Indicadores de educação, saúde e segurança ficam ligados a quem tem a responsabilidade executiva (presidente, governador, prefeito) e sempre com a ressalva de que muitos fatores influenciam.
- Fórum ou comentários abertos no MVP (moderação é cara e atrai brigas).
- App nativo no início — site responsivo primeiro.
- Recomendação de voto.

## 7. Como saber se está funcionando?

| Métrica | Meta inicial (90 dias após lançar) |
|---|---|
| Perfis vistos por visitante | ≥ 2 |
| Retorno em 30 dias | ≥ 20% dos visitantes |
| Compartilhamentos por 100 visitas | ≥ 5 |
| Dados com fonte e data visíveis | 100% |
| Erros de dado reportados e corrigidos em < 48h | 100% |

## Fontes de dados (todas públicas)

| Área | Fonte |
|---|---|
| Deputados federais | API Dados Abertos da Câmara (`dadosabertos.camara.leg.br/api/v2`) |
| Senadores | Dados Abertos do Senado (`legis.senado.leg.br/dadosabertos`) |
| Candidatos, bens, prestação de contas | Portal de Dados Abertos do TSE |
| Gastos do governo federal | Portal da Transparência (API exige cadastro de chave) |
| Finanças de estados e municípios | Tesouro Nacional — SICONFI |
| Educação | INEP (IDEB, Censo Escolar) |
| Saúde | DATASUS / OpenDataSUS |
| Segurança | Anuário do Fórum Brasileiro de Segurança Pública, SINESP |
| Economia | IBGE (API de serviços/SIDRA), Banco Central (SGS) |

## Riscos

| Risco | Gravidade | Mitigação |
|---|---|---|
| Percepção de viés político | Alta | Metodologia pública, mesmos critérios para todos, sem notas opinativas, código aberto |
| Dado errado ou desatualizado | Alta | Mostrar fonte e data em todo número; botão "reportar erro" |
| Legislação eleitoral em período de campanha | Média | Revisão jurídica antes de 2028 (eleições municipais); nada de propaganda |
| Mudança/instabilidade das APIs oficiais | Média | Ingestão em banco próprio com cache; alertas de falha |
| Sustentabilidade financeira | Média | Custos baixos no início; depois doações, editais de transparência, parcerias com universidades |
| Concorrentes existentes (ex.: Ranking dos Políticos, Operação Serenata de Amor) | Baixa | Diferencial: foco no "meu representante", linguagem simples e neutralidade |

## Recomendação: **GO** — com o MVP "Meu Deputado"

O problema é real, os dados são públicos e o momento (início de novos mandatos) é ideal. O maior risco não é técnico: é **credibilidade e neutralidade**. Isso precisa ser decidido antes da primeira linha de código.

## Próximos passos concretos

1. **Decidir princípios editoriais** (1 página): o que mostramos, o que não mostramos, como tratamos erros.
2. **Explorar a API da Câmara** e listar exatamente quais campos vão no perfil.
3. ~~Transformar este brief em plano técnico~~ → feito em [docs/capabilities/meu-deputado.md](docs/capabilities/meu-deputado.md).
4. Esboçar a tela de perfil (skill `frontend-design-direction`).
5. Construir o MVP com TDD (`tdd-workflow`).

Stack sugerida (a validar no plano técnico): Next.js + TypeScript, PostgreSQL, jobs agendados de ingestão, hospedagem na Vercel ou Render.

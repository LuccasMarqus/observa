# Direção visual do Observa

> Contrato de design da skill ECC `frontend-design-direction`. Vale para todas as páginas.

## Contrato da página de apresentação

| Item | Decisão |
|---|---|
| Superfície | Página inicial pública (`/`), primeira visita, quase sempre no celular |
| Trabalho do usuário | Entender em segundos que pode ver **como o deputado dele vota, gasta e propõe**, com fonte oficial |
| Ação principal | "Encontrar meu deputado" → `/deputados` |
| Hierarquia | 1. promessa (h1) · 2. ação principal · 3. prévia da ficha · 4. o que se acompanha · 5. princípios · 6. fontes e atualização |
| Viewports-alvo | `390x844` (celular) e `1440x900` (desktop) |

## Direção: "documento público"

- **Tom:** editorial e cívico, sóbrio como um jornal sério. Nada de cara de campanha, nem de startup.
- **Detalhe memorável:** a **ficha em forma de recibo**, uma prévia do perfil com borda serrilhada de comprovante, em que cada número leva um **selo de fonte**. É a regra do produto ("todo número tem fonte") virando forma.
- **Neutralidade nas cores:** vermelho, azul e verde-amarelo têm leitura partidária no Brasil e ficam fora. Base papel + grafite; acento **azul-petróleo** (sem associação partidária forte); um âmbar discreto só como "marca-texto" de destaque.
- **Tipografia:** duas famílias (limite de performance do ECC). **Fraunces** (serifa editorial) nos títulos; **IBM Plex Sans** no texto e nos números, com algarismos tabulares.
- **Sem:** gradientes roxos, blobs, cards dentro de cards, imagens genéricas, fotos de políticos reais na apresentação, ranking ou nota.

## Tokens

Definidos como variáveis CSS em `app/globals.css` (modo claro e escuro) e expostos ao Tailwind via `@theme`:

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--papel` | `#f6f3ec` | `#121416` | fundo |
| `--papel-2` | `#ece7dc` | `#1b1f22` | superfícies (ficha, seções) |
| `--tinta` | `#17191c` | `#ece8df` | texto principal |
| `--tinta-2` | `#4a4f57` | `#a9adb3` | texto secundário (contraste AA) |
| `--linha` | `#d6d0c3` | `#2d3337` | bordas e réguas |
| `--petroleo` | `#0e5c63` | `#5fb8bf` | acento, links, ação principal |
| `--petroleo-tinta` | `#ffffff` | `#0b1a1c` | texto sobre o acento |
| `--marca-texto` | `#f2d58a` | `#6b5520` | destaque pontual |

## Estados de conteúdo (página de apresentação)

| Estado | Situação |
|---|---|
| Carregando | Não se aplica: página estática gerada no build, sem busca de dados |
| Vazio | Não se aplica: conteúdo fixo |
| Erro | Não se aplica à página; erros de rota usam a página 404 padrão |
| Parcial | Não se aplica: não depende de dados externos |
| Sucesso | Página completa renderizada |
| Permissão | Não se aplica: site público, sem login |

## Acessibilidade (WCAG 2.2 AA)

Link "Pular para o conteúdo"; landmarks `header`/`nav`/`main`/`footer`; um único `h1`; foco visível em todos os controles; contraste AA nos dois temas; alvos de toque ≥ 44 px; `prefers-reduced-motion` respeitado; a ficha de exemplo é marcada como **dados fictícios**.

## Refinamento "moderno e clássico" (out/2026)

Mantém paleta, fontes e a ficha-recibo; muda o acabamento.

- **Clássico (jornal de referência):** filete duplo (`filete`) separando seções e no colofão; rubricas em versalete com traço (`rubrica`); Fraunces com eixo óptico (`opsz`) e itálico para ênfase ("*termina*" no h1); numerais 01–03 em itálico leve; marcadores romanos nos princípios.
- **Moderno:** cabeçalho fixo translúcido com desfoque; botão sólido com sombra em camadas, seta que avança no hover e leve compressão no clique; faixa de princípios invertida (tinta ↔ papel, nos dois temas); ficha com `drop-shadow` em camadas e inclinação de 0,8° em telas largas; `text-wrap: balance/pretty`.
- **Regras:** classes próprias são `@utility` (no Tailwind v4, CSS solto em `@layer components` é descartado no build); transições só em propriedades específicas; tudo zera com `prefers-reduced-motion`.
- **Contraste dos novos pares:** papel 80% sobre tinta 10,47:1 / 8,72:1; papel 70% 8,27:1 / 6,25:1; botão em hover 10,54:1 / 9,43:1 (claro / escuro).

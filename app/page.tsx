import Link from "next/link";
import { FichaExemplo } from "@/src/ui/landing/FichaExemplo";
import { URL_CODIGO_ABERTO } from "@/src/config/site";

const RECURSOS = [
  {
    numero: "01",
    titulo: "Votos",
    texto: "Como votou em cada votação nominal do Plenário, ao lado da orientação do partido dele.",
  },
  {
    numero: "02",
    titulo: "Gastos",
    texto: "Quanto usou da cota parlamentar, por categoria e por fornecedor, com o link para o documento fiscal quando a Câmara o publica.",
  },
  {
    numero: "03",
    titulo: "Projetos",
    texto: "Os projetos de lei e as propostas de emenda à Constituição que apresentou ou assinou.",
  },
] as const;

const PRINCIPIOS = [
  { marcador: "i.", titulo: "Fonte oficial em todo número", texto: "Cada dado indica de onde veio na Câmara e quando foi atualizado." },
  { marcador: "ii.", titulo: "Mesmos critérios para todos", texto: "Nenhuma regra muda conforme o partido ou a pessoa." },
  { marcador: "iii.", titulo: "Sem nota nem ranking", texto: "Mostramos fatos e como foram calculados. O julgamento é seu." },
] as const;

function Apresentacao() {
  return (
    <section
      aria-labelledby="titulo"
      className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-10 sm:px-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-20 lg:pb-28 lg:pt-20"
    >
      <div className="grid gap-7">
        <p className="rubrica text-tinta-2">Projeto independente · dados abertos da Câmara</p>
        <h1 id="titulo" className="font-serif text-[2.75rem] font-semibold leading-[1.02] tracking-[-0.02em] sm:text-6xl lg:text-[5.25rem]">
          Seu voto não <em className="font-normal italic text-petroleo">termina</em> na urna.
        </h1>
        <p className="max-w-xl text-lg leading-relaxed text-tinta-2">
          O Observa mostra, em linguagem simples, como cada deputado federal, inclusive quem recebeu o seu voto,{" "}
          <span className="font-medium text-tinta">vota, quanto gasta e o que propõe</span>, com cada número ligado à fonte oficial.
        </p>
        <div className="flex flex-wrap items-center gap-x-7 gap-y-3 pt-1">
          <Link href="/deputados" className="botao-primario">
            Encontrar deputados
            <span aria-hidden="true" className="seta">
              →
            </span>
          </Link>
          {/* Âncora nativa: além de rolar, move o ponto de partida do Tab para a seção. */}
          <a href="#o-que-voce-acompanha" className="link-editorial inline-flex min-h-12 items-center">
            O que você acompanha
          </a>
        </div>
      </div>
      <div className="sombra-papel lg:rotate-[0.8deg]">
        <FichaExemplo />
      </div>
    </section>
  );
}

function OQueVoceAcompanha() {
  return (
    <section id="o-que-voce-acompanha" aria-labelledby="titulo-recursos" className="mx-auto max-w-6xl px-4 sm:px-6">
      <div className="filete grid gap-12 py-16 lg:grid-cols-[1fr_3fr] lg:py-20">
        <div className="grid content-start gap-3">
          <p aria-hidden="true" className="rubrica text-tinta-2">
            Seção 1
          </p>
          <h2 id="titulo-recursos" className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
            O que você acompanha
          </h2>
        </div>
        <ul className="grid gap-10 md:grid-cols-3 md:gap-0 md:divide-x md:divide-linha">
          {RECURSOS.map(({ numero, titulo, texto }) => (
            <li key={titulo} className="grid content-start gap-3 md:px-7 md:first:pl-0 md:last:pr-0">
              <span aria-hidden="true" className="font-serif text-5xl font-light italic leading-none text-petroleo tabular-nums">
                {numero}
              </span>
              <h3 className="font-serif text-2xl font-semibold">{titulo}</h3>
              <p className="leading-relaxed text-tinta-2">{texto}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// Faixa invertida (tinta e papel trocados): texto ≥ 6,25:1 nos dois temas; o anel de foco passa a ser cor de papel.
function Principios() {
  return (
    <section id="principios" aria-labelledby="titulo-principios" className="bg-tinta text-papel [--cor-foco:var(--papel)]">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_2fr] lg:py-24">
        <div className="grid content-start gap-4">
          <p aria-hidden="true" className="rubrica text-papel/70">
            Seção 2
          </p>
          <h2 id="titulo-principios" className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
            Princípios
          </h2>
          <p className="leading-relaxed text-papel/80">
            Dados oficiais da Câmara dos Deputados, atualizados todos os dias às 6h (horário de Brasília). O cálculo de cada número é
            público, e o{" "}
            <a href={URL_CODIGO_ABERTO} className="text-papel underline decoration-1 underline-offset-4 hover:decoration-2">
              código aberto
            </a>{" "}
            pode ser conferido por qualquer pessoa.
          </p>
        </div>
        <ol className="grid gap-8 sm:grid-cols-3">
          {PRINCIPIOS.map(({ marcador, titulo, texto }) => (
            <li key={titulo} className="grid content-start gap-3 border-t border-papel/25 pt-5">
              <span aria-hidden="true" className="font-serif text-sm italic text-papel/70">
                {marcador}
              </span>
              <h3 className="font-serif text-xl font-semibold">{titulo}</h3>
              <p className="leading-relaxed text-papel/80">{texto}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <main id="conteudo" tabIndex={-1} className="flex-1">
      <Apresentacao />
      <OQueVoceAcompanha />
      <Principios />
    </main>
  );
}

// Prévia do perfil em forma de recibo. Dados FICTÍCIOS e rotulados como tal, inclusive perto
// dos números: o selo é demonstrativo e nunca atribui um valor inventado à Câmara.
const LINHAS = [
  { rotulo: "Participação em votações nominais", valor: "92%", detalhe: "184 de 200 votações no Plenário" },
  { rotulo: "Cota parlamentar em 2026", valor: "R$ 241.380,15", detalhe: "Maior gasto: divulgação da atividade" },
  { rotulo: "Projetos apresentados", valor: "18", detalhe: null },
] as const;

function SeloFonteExemplo() {
  return (
    <span className="inline-block border border-petroleo/40 px-1.5 py-0.5 text-xs uppercase tracking-wider text-petroleo">
      Fonte (exemplo)
    </span>
  );
}

function DetalheProjetos() {
  return (
    <>
      14 <abbr title="projetos de lei">PL</abbr> · 3 <abbr title="propostas de emenda à Constituição">PEC</abbr> · 1{" "}
      <abbr title="projeto de lei complementar">PLP</abbr>
    </>
  );
}

export function FichaExemplo() {
  return (
    <figure aria-labelledby="ficha-exemplo-legenda" className="recibo bg-papel-2 px-5 pb-10 pt-5 sm:px-6">
      <figcaption id="ficha-exemplo-legenda" className="flex items-baseline justify-between gap-3 border-b border-dashed border-linha pb-3">
        <span className="text-xs uppercase tracking-widest text-tinta-2">Exemplo de ficha</span>
        <span className="sr-only">, </span>
        <span className="bg-marca-texto px-1.5 text-xs font-medium text-tinta">dados fictícios</span>
      </figcaption>

      <div className="py-4">
        <p className="font-serif text-xl font-semibold">Deputada Exemplo da Silva</p>
        <p className="text-sm text-tinta-2">Partido e UF fictícios · em exercício</p>
      </div>

      <dl className="divide-y divide-dashed divide-linha border-y border-dashed border-linha">
        {LINHAS.map(({ rotulo, valor, detalhe }) => (
          <div key={rotulo} className="grid gap-1 py-3">
            <dt className="text-sm text-tinta-2">{rotulo}</dt>
            <dd className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-2xl font-semibold tabular-nums">{valor}</span>
              <SeloFonteExemplo />
            </dd>
            <dd className="text-xs text-tinta-2">{detalhe ?? <DetalheProjetos />}</dd>
          </div>
        ))}
      </dl>
    </figure>
  );
}

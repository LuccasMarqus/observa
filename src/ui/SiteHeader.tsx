import Link from "next/link";
import { URL_CODIGO_ABERTO } from "@/src/config/site";

const LINKS_NAVEGACAO = [
  { href: "/#o-que-voce-acompanha", rotulo: "O que você acompanha" },
  { href: "/#principios", rotulo: "Princípios" },
] as const;

const CLASSE_LINK_NAV =
  "inline-flex min-h-11 items-center underline-offset-[6px] decoration-1 transition-colors hover:text-tinta hover:underline";

export function SiteHeader() {
  return (
    <>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-petroleo focus:px-4 focus:py-3 focus:text-petroleo-tinta"
      >
        Pular para o conteúdo
      </a>
      <header className="z-40 border-b border-linha bg-papel md:sticky md:top-0 md:bg-papel/95 md:backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-2 sm:px-6">
          <Link
            href="/"
            aria-label="Observa, página inicial"
            className="inline-flex min-h-11 items-baseline font-serif text-2xl font-semibold tracking-tight"
          >
            Observa<span aria-hidden="true" className="text-petroleo">.</span>
          </Link>
          <nav aria-label="Principal">
            <ul className="flex flex-wrap items-center gap-x-6 text-sm text-tinta-2">
              {LINKS_NAVEGACAO.map(({ href, rotulo }) => (
                <li key={href}>
                  <Link href={href} className={CLASSE_LINK_NAV}>
                    {rotulo}
                  </Link>
                </li>
              ))}
              <li>
                <a href={URL_CODIGO_ABERTO} className={CLASSE_LINK_NAV}>
                  Código aberto
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </header>
    </>
  );
}

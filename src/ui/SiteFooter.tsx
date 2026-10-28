import { URL_CODIGO_ABERTO, URL_DADOS_ABERTOS_CAMARA, URL_REPORTAR_ERRO } from "@/src/config/site";

export function SiteFooter() {
  return (
    <footer className="mt-auto pt-14">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="filete grid gap-6 py-10 text-sm text-tinta-2 sm:grid-cols-[2fr_1fr]">
          <div className="grid content-start gap-3">
            <p aria-hidden="true" className="font-serif text-2xl font-semibold tracking-tight text-tinta">
              Observa<span className="text-petroleo">.</span>
            </p>
            <p className="max-w-prose leading-relaxed">
              <strong className="font-semibold text-tinta">Observa</strong> é um projeto independente: não tem ligação com
              partidos, governos ou candidatos. Os dados vêm dos{" "}
              <a href={URL_DADOS_ABERTOS_CAMARA} className="link-editorial">
                Dados Abertos da Câmara dos Deputados
              </a>
              .
            </p>
          </div>
          <ul className="grid content-start sm:justify-items-end">
            <li>
              <a href={URL_REPORTAR_ERRO} className="link-editorial inline-flex min-h-11 items-center">
                Reportar erro nos dados
              </a>
            </li>
            <li>
              <a href={URL_CODIGO_ABERTO} className="link-editorial inline-flex min-h-11 items-center">
                Código no GitHub
              </a>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

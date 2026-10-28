import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Sans } from "next/font/google";
import { SiteFooter } from "@/src/ui/SiteFooter";
import { SiteHeader } from "@/src/ui/SiteHeader";
import "./globals.css";

// Duas famílias (limite de performance): serifa editorial nos títulos, Plex no texto e nos números.
// Eixo opsz: títulos grandes ganham corte de display, textos pequenos ficam robustos. Itálico para ênfase editorial.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  display: "swap",
});
const plex = IBM_Plex_Sans({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const DESCRICAO =
  "Projeto independente: veja como os deputados federais votam, quanto gastam da cota parlamentar e quais projetos apresentam, com fonte oficial da Câmara.";

// Sem metadataBase/canonical até o domínio ser definido (questão Q5 do plano).
export const metadata: Metadata = {
  title: { default: "Observa · acompanhe os deputados federais", template: "%s · Observa" },
  description: DESCRICAO,
  openGraph: { type: "website", locale: "pt_BR", siteName: "Observa", title: "Observa", description: DESCRICAO },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" data-scroll-behavior="smooth" className={`${fraunces.variable} ${plex.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}

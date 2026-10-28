import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SiteFooter } from "@/src/ui/SiteFooter";
import { SiteHeader } from "@/src/ui/SiteHeader";

afterEach(cleanup);

describe("Cabeçalho do site", () => {
  it("oferece um link para pular direto ao conteúdo (teclado e leitor de tela)", () => {
    render(<SiteHeader />);

    expect(screen.getByRole("link", { name: "Pular para o conteúdo" }).getAttribute("href")).toBe("#conteudo");
  });

  it("mostra a marca levando à página inicial", () => {
    render(<SiteHeader />);

    expect(screen.getByRole("link", { name: /observa.*página inicial/i }).getAttribute("href")).toBe("/");
  });

  it("tem navegação principal nomeada", () => {
    render(<SiteHeader />);

    expect(screen.getByRole("navigation", { name: "Principal" })).toBeDefined();
  });
});

describe("Rodapé do site", () => {
  it("declara a independência do projeto", () => {
    render(<SiteFooter />);

    expect(screen.getByText(/não tem ligação com partidos, governos ou candidatos/i)).toBeDefined();
  });

  it("oferece um canal para reportar erro nos dados", () => {
    render(<SiteFooter />);

    expect(screen.getByRole("link", { name: /reportar erro/i }).getAttribute("href")).toBe(
      "https://github.com/LuccasMarqus/observa/issues",
    );
  });

  it("cita a fonte oficial dos dados", () => {
    render(<SiteFooter />);

    expect(screen.getByRole("link", { name: /dados abertos da câmara/i }).getAttribute("href")).toBe(
      "https://dadosabertos.camara.leg.br/",
    );
  });
});

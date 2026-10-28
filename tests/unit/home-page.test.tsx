import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import Home from "@/app/page";

afterEach(cleanup);

describe("Página de apresentação", () => {
  it("abre com a promessa do produto como título principal", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { level: 1, name: "Seu voto não termina na urna." })).toBeDefined();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("leva à ação principal: encontrar deputados", () => {
    render(<Home />);

    const acao = screen.getByRole("link", { name: "Encontrar deputados" });
    expect(acao.getAttribute("href")).toBe("/deputados");
  });

  it("deixa claro, já no topo, que é um projeto independente (não é site oficial)", () => {
    render(<Home />);

    expect(screen.getByText(/projeto independente · dados abertos da câmara/i)).toBeDefined();
  });

  it("mostra as três coisas que se acompanha: votos, gastos e projetos", () => {
    render(<Home />);

    const secao = screen.getByRole("region", { name: "O que você acompanha" });
    for (const nome of ["Votos", "Gastos", "Projetos"]) {
      expect(within(secao).getByRole("heading", { level: 3, name: nome })).toBeDefined();
    }
  });

  it("deixa claro que a ficha de exemplo usa dados fictícios", () => {
    render(<Home />);

    const ficha = screen.getByRole("figure", { name: /exemplo/i });
    expect(within(ficha).getByText(/dados fictícios/i)).toBeDefined();
  });

  it("na ficha de exemplo, o selo de fonte é demonstrativo e nunca atribui números fictícios à Câmara", () => {
    render(<Home />);

    const ficha = screen.getByRole("figure", { name: /exemplo/i });
    expect(within(ficha).getAllByText(/fonte \(exemplo\)/i).length).toBeGreaterThanOrEqual(3);
    expect(within(ficha).queryByText(/fonte: câmara dos deputados/i)).toBeNull();
    expect(within(ficha).getAllByRole("term")).toHaveLength(3);
  });

  it("explica os princípios de neutralidade", () => {
    render(<Home />);

    const secao = screen.getByRole("region", { name: "Princípios" });
    expect(within(secao).getByText(/fonte oficial em todo número/i)).toBeDefined();
    expect(within(secao).getByText(/mesmos critérios para todos/i)).toBeDefined();
    expect(within(secao).getByText(/sem nota nem ranking/i)).toBeDefined();
  });

  it("aponta para o código aberto do projeto", () => {
    render(<Home />);

    const links = screen.getAllByRole("link", { name: /código aberto/i });
    expect(links.some((link) => link.getAttribute("href") === "https://github.com/LuccasMarqus/observa")).toBe(true);
  });

  it("informa de onde vêm os dados e quando são atualizados", () => {
    render(<Home />);

    expect(screen.getByText(/atualizados todos os dias/i)).toBeDefined();
  });

  it("não exibe o conteúdo de exemplo do create-next-app", () => {
    render(<Home />);

    expect(screen.queryByText(/to get started/i)).toBeNull();
  });
});

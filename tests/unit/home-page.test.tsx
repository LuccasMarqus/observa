import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import Home from "@/app/page";

afterEach(cleanup);

describe("Página inicial", () => {
  it("mostra o nome do produto como título principal", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { level: 1, name: "Observa" })).toBeDefined();
  });

  it("explica em uma frase o que o cidadão pode fazer", () => {
    render(<Home />);

    expect(screen.getByText(/acompanhe o que seu deputado federal faz/i)).toBeDefined();
  });

  it("não exibe o conteúdo de exemplo do create-next-app", () => {
    render(<Home />);

    expect(screen.queryByText(/to get started/i)).toBeNull();
  });
});

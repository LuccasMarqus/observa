import { expect, test } from "@playwright/test";

test.describe("página de apresentação", () => {
  test("carrega em português com a promessa e a ação principal visíveis na primeira tela", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/Observa/);
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
    await expect(page.getByRole("heading", { level: 1, name: "Seu voto não termina na urna." })).toBeInViewport();
    await expect(page.getByRole("link", { name: "Encontrar deputados" })).toBeInViewport();
  });

  test("o primeiro Tab leva ao link de pular para o conteúdo", async ({ page }) => {
    await page.goto("/");

    await page.keyboard.press("Tab");

    const pular = page.getByRole("link", { name: "Pular para o conteúdo" });
    await expect(pular).toBeFocused();
    await expect(pular).toBeInViewport();
    expect((await pular.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(24);
  });

  test("Enter no link de pular leva o foco ao conteúdo principal", async ({ page }) => {
    await page.goto("/");

    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");

    await expect(page.locator("#conteudo")).toBeFocused();
  });

  test("todos os links fora de texto corrido têm área de toque de pelo menos 44 px", async ({ page }) => {
    await page.goto("/");

    const pequenos = await page.evaluate(() =>
      [...document.querySelectorAll("a")]
        .filter((a) => a.offsetParent !== null && !a.closest("p") && a.getAttribute("href") !== "#conteudo")
        .filter((a) => a.getBoundingClientRect().height < 44)
        .map((a) => a.textContent?.trim()),
    );
    expect(pequenos).toEqual([]);
  });

  test("a ação principal tem área de toque de pelo menos 44 px", async ({ page }) => {
    await page.goto("/");

    const caixa = await page.getByRole("link", { name: "Encontrar deputados" }).boundingBox();

    expect(caixa?.height ?? 0).toBeGreaterThanOrEqual(44);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`na faixa invertida o anel de foco usa a cor do papel, não o petróleo (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto("/");

      const link = page.locator("#principios").getByRole("link", { name: "código aberto" });
      await link.focus();

      const [contorno, papel] = await link.evaluate((el) => [
        getComputedStyle(el).outlineColor,
        getComputedStyle(el.closest("section")!).color,
      ]);
      expect(contorno).toBe(papel);
    });
  }

  test("o link 'O que você acompanha' leva o próximo Tab para dentro da seção", async ({ page }) => {
    await page.goto("/");

    await page.locator("#conteudo").getByRole("link", { name: "O que você acompanha" }).click();
    await page.keyboard.press("Tab");

    // A seção não tem links; o próximo foco deve estar depois dela, nunca de volta no topo.
    const depoisDaSecao = await page.evaluate(() => {
      const secao = document.getElementById("o-que-voce-acompanha")!;
      const ativo = document.activeElement!;
      return Boolean(secao.compareDocumentPosition(ativo) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(depoisDaSecao).toBe(true);
  });

  test("o cabeçalho fixo não cobre o elemento focado por Tab", async ({ page }) => {
    await page.goto("/");

    const cobertos: string[] = [];
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      const resultado = await page.evaluate(() => {
        const ativo = document.activeElement as HTMLElement;
        const cabecalho = document.querySelector("header")!;
        // Ignora: elementos fixos (o link de pular fica por cima do cabeçalho) e destinos de foco
        // programático com tabIndex -1 (o <main> inteiro), que não fazem parte da ordem de Tab.
        const ignorar =
          cabecalho.contains(ativo) ||
          ativo.tabIndex < 0 ||
          getComputedStyle(ativo).position === "fixed" ||
          getComputedStyle(cabecalho).position !== "sticky";
        if (ignorar) return null;
        const coberto = ativo.getBoundingClientRect().top < cabecalho.getBoundingClientRect().bottom;
        return coberto ? (ativo.textContent ?? "").trim() : null;
      });
      if (resultado) cobertos.push(resultado);
    }
    expect(cobertos).toEqual([]);
  });

  test("não tem rolagem horizontal", async ({ page }) => {
    await page.goto("/");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

import { expect, test } from "@playwright/test";

test.describe("página inicial", () => {
  test("carrega em português com o nome do produto", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle("Observa");
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
    await expect(page.getByRole("heading", { level: 1, name: "Observa" })).toBeVisible();
  });

  test("não tem rolagem horizontal", async ({ page }) => {
    await page.goto("/");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

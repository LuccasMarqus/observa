import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      {
        extends: true,
        test: { name: "unit", environment: "jsdom", include: ["tests/unit/**/*.test.{ts,tsx}"] },
      },
      {
        // Requer DATABASE_URL apontando para um Postgres (docker compose up -d db).
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["tests/integration/setup-banco-local.ts"],
          fileParallelism: false,
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["app/**/*.{ts,tsx}", "src/**/*.{ts,tsx}", "db/**/*.ts"],
      // layout.tsx usa next/font, que só roda dentro do Next; coberto pelo E2E.
      exclude: ["app/layout.tsx"],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});

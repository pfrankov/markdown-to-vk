import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      enabled: false,
      include: ["src/**/*.ts"],
      exclude: ["src/types.ts", "src/index.ts"],
      thresholds: {
        lines: 95,
        statements: 95,
      },
    },
  },
});

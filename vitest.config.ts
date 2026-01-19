import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["packages/**/src/**/*.test.ts"],
    pool: "forks",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      include: ["packages/**/src/**/*.ts"],
      exclude: ["packages/**/src/**/*.test.ts", "packages/**/src/**/*.d.ts", "packages/**/src/test/**"],
      thresholds: {
        lines: 55,
        functions: 55,
        branches: 55,
        statements: 55,
      },
    },
    setupFiles: ["./packages/vscode/src/test/setup.ts"],
    mockReset: true,
    restoreMocks: true,
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    pool: "forks",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.d.ts", "src/test/**"],
      thresholds: {
        lines: 55,
        functions: 55,
        branches: 55,
        statements: 55,
      },
    },
    setupFiles: ["./src/test/setup.ts"],
    mockReset: true,
    restoreMocks: true,
  },
});

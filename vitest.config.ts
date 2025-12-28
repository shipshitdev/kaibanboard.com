import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.d.ts", "src/test/**"],
      thresholds: {
        lines: 99,
        functions: 100,
        branches: 89,
        statements: 99,
      },
    },
    setupFiles: ["./src/test/setup.ts"],
    mockReset: true,
    restoreMocks: true,
  },
});

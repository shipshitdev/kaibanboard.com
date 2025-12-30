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
        // Temporarily lowered for AI provider integration and test fixes
        // TODO: Increase thresholds as more tests are added
        lines: 49,
        functions: 55,
        branches: 40,
        statements: 49,
      },
    },
    setupFiles: ["./src/test/setup.ts"],
    mockReset: true,
    restoreMocks: true,
  },
});

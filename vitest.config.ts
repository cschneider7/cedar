import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["app/**/*.test.ts"],
    setupFiles: ["./app/lib/clerk-test-setup.ts"],
  },
})

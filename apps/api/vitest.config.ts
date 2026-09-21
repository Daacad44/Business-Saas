import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    testTimeout: 90000,
    setupFiles: ["./src/__tests__/setup-reference-data.ts"],
  },
});

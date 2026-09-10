import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [{ find: /^(\..*)\.js$/, replacement: "$1.ts" }],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});

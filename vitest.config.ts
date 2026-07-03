import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
  test: {
    // Component tests opt into jsdom via a per-file pragma
    // (// @vitest-environment jsdom); everything else runs in node.
    environment: "node",
    include: ["lib/**/*.test.ts", "components/**/*.test.tsx", "tests/**/*.test.ts"],
    // Integration tests mutate shared DB state — keep them sequential.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});

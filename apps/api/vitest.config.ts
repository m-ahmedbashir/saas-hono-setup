import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./vitest.setup.ts"],
    // `tsc` build output: Vitest 4's default exclude dropped dist/, so every integration
    // file would otherwise run twice (once from src, once compiled).
    exclude: [...configDefaults.exclude, "dist/**"],
    // Integration tests share one real database (no isolated test DB yet), so files running
    // concurrently interfere with each other's rows — e.g. a seat-limit check seeing a join
    // that another file's setup just made room for.
    fileParallelism: false,
  },
});

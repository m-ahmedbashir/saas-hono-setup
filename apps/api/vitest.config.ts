import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./vitest.setup.ts"],
    // Integration tests share one real database (no isolated test DB yet), so files running
    // concurrently interfere with each other's rows — e.g. a seat-limit check seeing a join
    // that another file's setup just made room for.
    fileParallelism: false,
  },
});

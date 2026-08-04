import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist", "**/node_modules", "**/*.generated.ts"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        // Explicit glob list, not `project: true` — the latter's Project Service mode
        // walks up to the single nearest tsconfig.json and requires that file's own
        // `include` to cover whatever's being linted. Each package's real tsconfig.json
        // scopes `include`/`rootDir` to `src` on purpose (correct compiled output
        // layout), which left root-level tooling config (drizzle.config.ts,
        // vitest.config.ts, vitest.setup.ts, scripts/) un-lintable with type
        // information — not skipped, a hard parse error. A second, lint-only
        // `tsconfig.eslint.json` per package (broader `include`, `rootDir: "."`,
        // `noEmit: true` so it never conflicts with the real build) picks up exactly
        // those files; classic multi-project mode tries every glob per file and uses
        // whichever program actually includes it.
        project: [
          "packages/*/tsconfig.json",
          "packages/*/tsconfig.eslint.json",
          "apps/*/tsconfig.json",
          "apps/*/tsconfig.eslint.json",
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);

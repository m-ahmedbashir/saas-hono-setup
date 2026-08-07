import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";

// `eslint-config-next`'s bundled `core-web-vitals`/`typescript` presets were tried first
// and dropped — both pull in `eslint-plugin-react@7.37.5`, whose peer range caps at
// `eslint@^9.x` and actually crashes at runtime under eslint@10.7.0 (`TypeError: Error
// while loading rule 'react/display-name': contextOrFilename.getFilename is not a
// function` — that API was removed in ESLint 10; the plugin never migrated to
// `context.filename`). Confirmed by hitting the crash directly, not assumed. Built by
// hand instead from the pieces that ARE eslint@10-compatible: `@next/eslint-plugin-next`
// (Vercel's own, no peerDependencies cap) for Core Web Vitals rules, and
// `eslint-plugin-react-hooks@7.1.1` (peer range explicitly includes `^10.0.0`) for hooks
// rules. This means no `eslint-plugin-react`/`jsx-a11y`/`import` rules (prop-types,
// jsx-a11y a11y checks, import ordering) — an acceptable gap for now, not something to
// silently paper over: revisit once eslint-plugin-react ships a real ESLint 10 release.
export default tseslint.config(
  {
    ignores: ["**/.next", "**/node_modules", "**/*.generated.ts"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        project: true,
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
  {
    // eslint-plugin-react-hooks@7's "recommended"/"recommended-latest" bundle in a large
    // set of new React-Compiler-purity rules (`purity`, `set-state-in-effect`, `refs`,
    // `immutability`, `static-components`, etc.) as errors by default — v7 is the first
    // major version where "recommended" means "React Compiler compatible", not just "hooks
    // called correctly". Those fired throughout the template's own vendored shadcn/ui
    // components (setState-on-mount patterns, `Math.random()` in skeleton placeholders,
    // ref assignment during render) — legitimate, common React patterns, not bugs, and not
    // something worth rewriting a dozen vendored files over. Keeping only the two
    // rules every prior version of this plugin actually enforced.
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    plugins: { "@next/next": nextPlugin },
    rules: nextPlugin.configs["core-web-vitals"].rules,
  },
);

// The only module frontends may import from @repo/api, and only with `import type` — it
// carries no runtime code, so nothing server-side can reach a browser bundle.
export type { AppType } from "./app";

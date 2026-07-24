import type { Context } from "hono";
import type { z } from "zod";

/**
 * Reconstructs the exact `{ in, out }` shape @hono/zod-validator's zValidator produces
 * for a given schema on the "json" target (see its DefaultInput type) — needed because
 * pulling a handler out of the same .post(path, validator, handler) chain it's validated
 * in loses TypeScript's contextual inference for c.req.valid(); a plain `Context` types
 * it as unusable (`never`). See AGENTS.md's route handler discipline rule.
 */
export type ValidatedJsonContext<Schema extends z.ZodType> = Context<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  string,
  { in: { json: z.input<Schema> }; out: { json: z.output<Schema> } }
>;

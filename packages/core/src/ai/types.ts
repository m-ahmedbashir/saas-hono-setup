import type { z } from "zod";

export interface AIAgent<TInput extends z.ZodTypeAny, TOutput extends z.ZodTypeAny> {
  id: string;
  name: string;
  modelTier: string;
  inputSchema: TInput;
  outputSchema: TOutput;
  generateSystemPrompt(input: z.infer<TInput>): string;
}

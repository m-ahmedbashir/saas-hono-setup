import { z } from "zod";
import type { AIAgent } from "../types";

export const GeneratorInputSchema = z.object({
  topic: z.string(),
  difficulty: z.enum(["beginner", "intermediate", "expert"]),
});

export const GeneratorOutputSchema = z.object({
  exerciseId: z.string(),
  questionText: z.string(),
  hints: z.array(z.string()),
  referenceAnswer: z.string(),
});

export const exerciseGenerator = {
  id: "exercise-generator",
  name: "Exercise Generator Agent",
  modelTier: "math",
  inputSchema: GeneratorInputSchema,
  outputSchema: GeneratorOutputSchema,

  generateSystemPrompt(input) {
    return `You are a cognitive math educator.
Generate an exercise on the topic of: ${input.topic}.
Ensure the challenge level matches: ${input.difficulty}.
Output your response strictly matching the required JSON schema.`;
  },
} satisfies AIAgent<typeof GeneratorInputSchema, typeof GeneratorOutputSchema>;

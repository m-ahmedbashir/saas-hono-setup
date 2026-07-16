import { exerciseGenerator } from "./agents/exercise-generator";

export const agentRegistry = {
  [exerciseGenerator.id]: exerciseGenerator,
} as const;

export type AgentId = keyof typeof agentRegistry;

import { describe, it, expect } from "vitest";
import { updateMastery } from "./bkt-scoring";

describe("updateMastery", () => {
  const params = { pLearn: 0.3, pGuess: 0.2, pSlip: 0.1, pKnownPrior: 0.5 };

  it("increases mastery on a correct answer", () => {
    const result = updateMastery(params, true);
    expect(result).toBeGreaterThan(params.pKnownPrior);
  });

  it("still increases mastery on an incorrect answer, but less than a correct one", () => {
    const correct = updateMastery(params, true);
    const incorrect = updateMastery(params, false);
    expect(incorrect).toBeLessThan(correct);
  });
});

export interface BktParams {
  pLearn: number;
  pGuess: number;
  pSlip: number;
  pKnownPrior: number;
}

export function updateMastery(params: BktParams, correct: boolean): number {
  const { pLearn, pGuess, pSlip, pKnownPrior } = params;

  const pCorrectGivenKnown = correct ? 1 - pSlip : pSlip;
  const pCorrectGivenUnknown = correct ? pGuess : 1 - pGuess;

  const numerator = pKnownPrior * pCorrectGivenKnown;
  const denominator = numerator + (1 - pKnownPrior) * pCorrectGivenUnknown;
  const pKnownGivenEvidence = denominator === 0 ? pKnownPrior : numerator / denominator;

  return pKnownGivenEvidence + (1 - pKnownGivenEvidence) * pLearn;
}

// Boost arithmetic and Connects spending limits. Pure functions; unit-tested.

export const CONNECT_PRICE_USD = 0.15;
/** Upwork's own best case: boosting raises your hire chance by "up to 24%" (relative). */
export const BOOST_UPLIFT = 0.24;

export type BoostAdvice = {
  costUsd: number;
  expectedGainUsd: number;
  breakEvenConnects: number;
  worthIt: boolean;
  reasons: string[];
};

/**
 * Get Seen on Upwork 2026, ch. 3: gain = win rate × uplift × job profit; cost =
 * boost Connects × $0.15. Plus the book's rules of thumb.
 */
export function boostAdvice(opts: {
  boostConnects: number;
  winRate: number; // 0..1
  jobProfitUsd: number;
  healthMet?: number; // conditions met of 7
  proposalsTier?: string;
}): BoostAdvice {
  const costUsd = round(opts.boostConnects * CONNECT_PRICE_USD);
  const expectedGainUsd = round(opts.winRate * BOOST_UPLIFT * opts.jobProfitUsd);
  const breakEvenConnects = Math.floor(expectedGainUsd / CONNECT_PRICE_USD);
  const reasons: string[] = [];

  let worthIt = expectedGainUsd > costUsd;
  reasons.push(
    worthIt
      ? `Expected gain ~$${expectedGainUsd.toFixed(2)} beats the $${costUsd.toFixed(2)} boost cost (break-even ≈ ${breakEvenConnects} Connects).`
      : `Expected gain ~$${expectedGainUsd.toFixed(2)} is less than the $${costUsd.toFixed(2)} boost cost (break-even ≈ ${breakEvenConnects} Connects).`,
  );
  if (opts.healthMet !== undefined && opts.healthMet < 5) {
    worthIt = false;
    reasons.push(`Your profile meets ${opts.healthMet}/7 visibility conditions. The book's rule: never boost an unfinished profile; the client compares you with everyone below.`);
  }
  if (opts.proposalsTier && ["Fewer than 5", "5 to 10"].includes(opts.proposalsTier)) {
    reasons.push(`Only ${opts.proposalsTier.toLowerCase()} proposals so far: you are likely on the first screen anyway.`);
  }
  return { costUsd, expectedGainUsd, breakEvenConnects, worthIt, reasons };
}

export type ConnectsLimits = { maxPerProposal: number; maxPerDay: number };

/** Blocks a submission that would break the user's own Connects limits or exceed the balance. */
export function checkConnects(opts: {
  cost: number;
  boost: number;
  balance?: number;
  spentLast24h: number;
  limits: ConnectsLimits;
}): string | null {
  const total = opts.cost + opts.boost;
  if (opts.balance !== undefined && total > opts.balance) {
    return `Needs ${total} Connects but your balance is ${opts.balance}.`;
  }
  if (total > opts.limits.maxPerProposal) {
    return `Needs ${total} Connects, above your per-proposal limit of ${opts.limits.maxPerProposal} (change it in Searches & rules).`;
  }
  if (opts.spentLast24h + total > opts.limits.maxPerDay) {
    return `You've spent ${opts.spentLast24h} Connects in the last 24h; this would pass your daily limit of ${opts.limits.maxPerDay}.`;
  }
  return null;
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

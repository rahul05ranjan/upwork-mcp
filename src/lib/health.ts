// Profile visibility checks from "Get Seen on Upwork 2026" (an independent
// buyer-side study, not Upwork's formula). Pure functions, no server imports,
// so they are unit-tested directly.

export type HealthInputs = {
  earned: boolean | undefined;
  employmentEntries: number | undefined;
  hourlyRate: number | undefined;
  /** Middle of the posted hourly budgets in the user's feed (proxy for the typical applicant). */
  typicalRate: number | undefined;
  typicalRateSample: number;
  /** Most recent start/end date among past Upwork contracts. */
  lastContractDate: string | undefined;
  portfolioItems: number | undefined;
  freelancerAccount: boolean | undefined;
  manual: ManualHealth;
  now?: Date;
};

/** Things the Upwork API does not expose; the user ticks them after checking upwork.com. */
export type ManualHealth = {
  complete100?: boolean;
  hireAgain90?: boolean;
  responseTimeShown?: boolean;
  activeContract?: boolean;
};

export type Status = "pass" | "fail" | "unknown";

export type Condition = {
  id: string;
  label: string;
  status: Status;
  detail: string;
  fix?: string;
  /** "manual" means the user confirms it; the API can't see it. */
  source: "auto" | "manual";
};

/** Share of freelancers who reached page one by conditions met (Table 5.1). */
const PAGE_ONE_ODDS = [0, 0, 0, 5, 8, 14, 29, 37];

export function pageOneOdds(met: number): number {
  return PAGE_ONE_ODDS[Math.max(0, Math.min(7, met))];
}

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export function evaluateHealth(i: HealthInputs): {
  conditions: Condition[];
  met: number;
  unknown: number;
  odds: { low: number; high: number };
  hiddenRisk: { level: "high" | "medium" | "low"; detail: string };
} {
  const now = i.now ?? new Date();
  const m = i.manual;
  const cond: Condition[] = [];

  cond.push({
    id: "earned",
    label: "Has earned on Upwork",
    source: "auto",
    status: i.earned === undefined ? "unknown" : i.earned ? "pass" : "fail",
    detail: i.earned ? "You have Upwork earnings." : "No earnings yet: brand-new accounts reached page one 2 times in 100.",
    fix: i.earned ? undefined : "Win a first job, however small. Any earnings lift page-one odds to about 1 in 5.",
  });

  const entries = i.employmentEntries;
  const completeStatus: Status =
    entries === 0 ? "fail" : m.complete100 === undefined ? "unknown" : m.complete100 ? "pass" : "fail";
  cond.push({
    id: "complete",
    label: "Profile 100% complete, with employment history",
    source: "manual",
    status: completeStatus,
    detail:
      entries === 0
        ? "Employment history is empty, which caps completeness at 40%."
        : `${entries ?? "?"} employment entr${entries === 1 ? "y" : "ies"}. Tick the box once Upwork's meter shows 100%.`,
    fix:
      completeStatus === "pass"
        ? undefined
        : "Get Upwork's completeness meter to 100%. Earners at 100% reached page one 23 in 100; below, about 6.",
  });

  let rateStatus: Status = "unknown";
  let rateDetail = "Not enough hourly jobs in your feed yet to estimate the typical rate.";
  if (i.hourlyRate !== undefined && i.typicalRate !== undefined && i.typicalRateSample >= 5) {
    const ratio = i.hourlyRate / i.typicalRate;
    rateStatus = ratio >= 1 ? "pass" : "fail";
    rateDetail = `Your rate $${i.hourlyRate}/hr is ${ratio.toFixed(2)}× the typical posted rate ($${round(i.typicalRate)}/hr, from ${i.typicalRateSample} hourly jobs in your feed).`;
  }
  cond.push({
    id: "rate",
    label: "Profile rate at or above the typical applicant",
    source: "auto",
    status: rateStatus,
    detail: rateDetail,
    fix:
      rateStatus === "fail"
        ? `Raise your profile rate to at least $${round(i.typicalRate!)}/hr; 1.25–1.75× once your record supports it. Below-typical rates reached page one 13 in 100, at or above 30 in 100. (If you're winning your first recent job, do that first.)`
        : undefined,
  });

  cond.push({
    id: "hireAgain",
    label: "Hire-again rate 90% or more",
    source: "manual",
    status: m.hireAgain90 === undefined ? "unknown" : m.hireAgain90 ? "pass" : "fail",
    detail: "Shown on your Upwork profile; the API doesn't expose it.",
    fix: m.hireAgain90 ? undefined : "Ask happy past clients to rehire or leave feedback on similar work.",
  });

  const lastMs = i.lastContractDate ? Date.parse(i.lastContractDate) : NaN;
  const recent = m.activeContract || (Number.isFinite(lastMs) && now.getTime() - lastMs <= YEAR_MS);
  cond.push({
    id: "recent",
    label: "At least one job in the last 12 months",
    source: "auto",
    status: recent ? "pass" : i.lastContractDate === undefined && !m.activeContract ? "unknown" : "fail",
    detail: m.activeContract
      ? "You marked an active contract."
      : i.lastContractDate
        ? `Last past contract: ${i.lastContractDate.slice(0, 10)}.`
        : "No past contracts found.",
    fix: recent ? undefined : "Land a small, fast job soon; a dormant account slides down the list.",
  });

  cond.push({
    id: "responseTime",
    label: "Response time shows on your profile",
    source: "manual",
    status: m.responseTimeShown === undefined ? "unknown" : m.responseTimeShown ? "pass" : "fail",
    detail: "Upwork shows it from how you reply to client messages.",
    fix: m.responseTimeShown ? undefined : "Reply to every client message, even to say no, so Upwork can show a response time.",
  });

  cond.push({
    id: "notAgencyOnly",
    label: "Not working only through an agency",
    source: "auto",
    status: i.freelancerAccount === undefined ? "unknown" : i.freelancerAccount ? "pass" : "fail",
    detail: i.freelancerAccount ? "Applying from your freelancer account." : "Agency-only freelancers reached page one 3 in 100.",
    fix: i.freelancerAccount ? undefined : "Keep the individual freelancer option open and apply from it.",
  });

  const met = cond.filter((c) => c.status === "pass").length;
  const unknown = cond.filter((c) => c.status === "unknown").length;

  let hiddenRisk: { level: "high" | "medium" | "low"; detail: string };
  if (entries === 0) {
    hiddenRisk = { level: "high", detail: "Empty employment history: hidden about 2–3 times in 4. Add at least two real entries first." };
  } else if (entries === 1 && !i.earned) {
    hiddenRisk = { level: "medium", detail: "One employment entry on a new account: hidden about 1 in 4. Add a second." };
  } else if (m.complete100 === false) {
    hiddenRisk = { level: "medium", detail: "Profile under 100%: every step below 100 raised the risk of being hidden." };
  } else if (entries === 1) {
    hiddenRisk = { level: "low", detail: "One entry with earnings: rarely hidden (about 2 in 100). A second entry also helps you climb." };
  } else {
    hiddenRisk = { level: "low", detail: "Two or more entries: rarely hidden, especially at 100% complete." };
  }

  return { conditions: cond, met, unknown, odds: { low: pageOneOdds(met), high: pageOneOdds(met + unknown) }, hiddenRisk };
}

/** Extra improvements beyond the seven, in the book's order of impact. */
export function extraFixes(i: HealthInputs): string[] {
  const fixes: string[] = [];
  if ((i.employmentEntries ?? 0) < 3) {
    fixes.push(`Add employment history up to 3+ real entries (you have ${i.employmentEntries ?? 0}); 3+ reached page one 26 in 100 vs 18.`);
  }
  if ((i.portfolioItems ?? 0) < 15) {
    fixes.push(`Grow your portfolio toward 15–20 specific items (you have ${i.portfolioItems ?? 0}); Best Match picks had about 19.`);
  }
  return fixes;
}

/** Profile rate against one job's posted hourly budget (the book's proxy for the typical applicant). */
export function rateVsBudget(rate: number | undefined, min: number | null | undefined, max: number | null | undefined) {
  if (!rate) return undefined;
  const mid = min && max ? (min + max) / 2 : (max ?? min ?? undefined);
  if (!mid) return undefined;
  const ratio = rate / mid;
  return {
    ratio,
    typical: mid,
    verdict: ratio >= 1.25 ? "strong" : ratio >= 1 ? "ok" : "below",
  } as const;
}

export function median(values: number[]): number | undefined {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return undefined;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

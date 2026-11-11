import "server-only";
import { db } from "@/lib/db";
import { parseMoney } from "@/lib/feed/parse";
import { getSettings } from "@/lib/feed/settings";
import { getProfileContext, type ProfileContext } from "@/lib/profile";
import { kvGet, kvSet } from "@/lib/store";
import { median, type HealthInputs, type ManualHealth } from "./health";

const MANUAL_KEY = "health_manual";

export function getManualHealth(): ManualHealth {
  return kvGet<ManualHealth>(MANUAL_KEY) ?? {};
}

export function saveManualHealth(m: ManualHealth): void {
  kvSet(MANUAL_KEY, m);
}

/** Midpoints of posted hourly budgets in the feed: the book's proxy for the typical applicant's rate. */
export function typicalFeedRate(): { rate: number | undefined; sample: number } {
  const query = (where: string) =>
    (db().prepare(`SELECT budget_min, budget_max FROM jobs WHERE job_type = 'hourly' AND ${where}`).all() as {
      budget_min: number | null;
      budget_max: number | null;
    }[])
      .map((r) => (r.budget_min && r.budget_max ? (r.budget_min + r.budget_max) / 2 : (r.budget_max ?? r.budget_min)))
      .filter((v): v is number => typeof v === "number" && v > 0);

  // Prefer the jobs you'd actually apply to; fall back to everything seen.
  let mids = query("rule_reject IS NULL");
  if (mids.length < 5) mids = query("1 = 1");
  return { rate: median(mids), sample: mids.length };
}

function lastContractDate(ctx: ProfileContext): string | undefined {
  const dates = ctx.workHistory.flatMap((w) => [w.endedOn, w.startedOn]).filter((d): d is string => !!d);
  return dates.sort().at(-1);
}

export function healthInputs(): { inputs: HealthInputs; profileLoaded: boolean } {
  const ctx = getProfileContext();
  const { orgLabel } = getSettings();
  const typical = typicalFeedRate();
  const earnedAmount = parseMoney(ctx?.totals.earnings);
  return {
    profileLoaded: !!ctx,
    inputs: {
      earned: ctx ? (earnedAmount ?? 0) > 0 || (ctx.totals.jobs ?? 0) > 0 : undefined,
      employmentEntries: ctx?.employment.length,
      hourlyRate: ctx?.hourlyRate,
      typicalRate: typical.rate,
      typicalRateSample: typical.sample,
      lastContractDate: ctx ? lastContractDate(ctx) : undefined,
      portfolioItems: ctx?.portfolio.length,
      freelancerAccount: orgLabel ? /freelancer/i.test(orgLabel) : undefined,
      manual: getManualHealth(),
    },
  };
}

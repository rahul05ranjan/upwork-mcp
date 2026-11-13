// Pure helpers that turn an Upwork profile into starting searches and rules.
// No server-only imports, so the tests can run them directly with `node --test`.

import type { Rules } from "./parse";

export type SearchSeed = { name: string; kind: "search" | "smart"; params: Record<string, unknown> };
type Existing = { kind: "search" | "smart"; params: Record<string, unknown> };

/** One search per skill keeps runs to a few Upwork calls; the rest can be added by hand. */
export const MAX_SKILL_SEARCHES = 5;

/** Upwork's recommendation feed for this profile, newest first. */
export const RECOMMENDED_SEARCH: SearchSeed = {
  name: "Upwork recommendations (today)",
  kind: "smart",
  params: { mode: "most_recent", days_posted: 1 },
};

const SKILL_PARAMS = { verified_payment_only: true, proposals_max: 20, sort: "recency" } as const;

/**
 * Searches a profile should start with: Upwork's recommendations, plus one
 * search per profile skill (in the order the profile lists them). Skips any
 * the profile already has, so it is safe to run again.
 */
export function searchesFromProfile(skills: string[], existing: Existing[]): SearchSeed[] {
  const seeds: SearchSeed[] = [];
  if (!existing.some((s) => s.kind === "smart")) seeds.push(RECOMMENDED_SEARCH);

  const covered = new Set(
    existing
      .filter((s) => s.kind === "search" && Array.isArray(s.params.skills) && s.params.skills.length === 1)
      .map((s) => String((s.params.skills as unknown[])[0]).toLowerCase()),
  );
  const unique: string[] = [];
  for (const raw of skills) {
    const skill = raw.trim();
    if (skill && !unique.some((u) => u.toLowerCase() === skill.toLowerCase())) unique.push(skill);
  }
  for (const skill of unique.slice(0, MAX_SKILL_SEARCHES)) {
    if (covered.has(skill.toLowerCase())) continue;
    seeds.push({ name: `${skill} jobs`, kind: "search", params: { skills: [skill], ...SKILL_PARAMS } });
  }
  return seeds;
}

/** Fills rules the profile can answer and the user hasn't set: never show hourly jobs below your own rate. */
export function rulesFromProfile(rules: Rules, hourlyRate: number | undefined): Rules {
  if (rules.minHourlyRate !== undefined || !hourlyRate) return rules;
  return { ...rules, minHourlyRate: hourlyRate };
}

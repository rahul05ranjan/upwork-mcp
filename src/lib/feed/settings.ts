import "server-only";
import { kvGet, kvSet } from "@/lib/store";
import { DEFAULT_RULES, type Rules } from "./parse";

// Per-profile settings, stored in the active profile's database. Which Upwork
// account is active lives in the session (src/lib/session.ts), not here.

export type Settings = {
  /** Minutes between automatic runs; 0 turns the scheduler off. */
  intervalMinutes: number;
  /** Result pages (10 jobs each) to read per saved search per run. */
  pagesPerSearch: number;
  rules: Rules;
  /** Your own spending limits; Approve is refused above them. */
  maxConnectsPerProposal: number;
  maxConnectsPerDay: number;
  /** Your rough win rate per proposal, for the boost calculator. */
  winRatePercent: number;
};

const KEY = "settings";

export const DEFAULT_SETTINGS: Settings = {
  intervalMinutes: 30,
  pagesPerSearch: 2,
  rules: DEFAULT_RULES,
  maxConnectsPerProposal: 30,
  maxConnectsPerDay: 60,
  winRatePercent: 3,
};

export function getSettings(): Settings {
  const saved: Partial<Settings> & { orgUid?: string; orgLabel?: string } = kvGet(KEY) ?? {};
  // orgUid/orgLabel were stored here before profiles were split out; drop them.
  delete saved.orgUid;
  delete saved.orgLabel;
  return { ...DEFAULT_SETTINGS, ...saved, rules: { ...DEFAULT_RULES, ...saved.rules } };
}

export function saveSettings(update: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...update };
  kvSet(KEY, next);
  return next;
}

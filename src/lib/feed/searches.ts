import "server-only";
import { db, nowIso, transaction } from "@/lib/db";
import { kvGet, kvSet } from "@/lib/store";
import type { ProfileContext } from "@/lib/profile";
import { reapplyRules } from "./jobs";
import { rulesFromProfile, searchesFromProfile } from "./profile-seed";
import { getSettings, saveSettings } from "./settings";

export type SearchKind = "search" | "smart";

export type SavedSearch = {
  id: number;
  name: string;
  kind: SearchKind;
  /** find_jobs `params` for this search (without cursor/limit). */
  params: Record<string, unknown>;
  enabled: boolean;
  lastRunAt: string | null;
  lastStatus: "ok" | "warning" | "error" | null;
  lastMessage: string | null;
};

type Row = {
  id: number;
  name: string;
  kind: SearchKind;
  params: string;
  enabled: number;
  last_run_at: string | null;
  last_status: SavedSearch["lastStatus"];
  last_message: string | null;
};

function fromRow(r: Row): SavedSearch {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    params: JSON.parse(r.params),
    enabled: r.enabled === 1,
    lastRunAt: r.last_run_at,
    lastStatus: r.last_status,
    lastMessage: r.last_message,
  };
}

export function listSearches(): SavedSearch[] {
  return (db().prepare("SELECT * FROM searches ORDER BY id").all() as Row[]).map(fromRow);
}

export function createSearch(name: string, kind: SearchKind, params: Record<string, unknown>): void {
  db().prepare("INSERT INTO searches (name, kind, params) VALUES (?, ?, ?)").run(name, kind, JSON.stringify(params));
}

export function setSearchEnabled(id: number, enabled: boolean): void {
  db().prepare("UPDATE searches SET enabled = ? WHERE id = ?").run(enabled ? 1 : 0, id);
}

export function deleteSearch(id: number): void {
  db().prepare("DELETE FROM searches WHERE id = ?").run(id);
}

export function recordSearchResult(id: number, status: "ok" | "warning" | "error", message: string | null, at: string): void {
  db()
    .prepare("UPDATE searches SET last_run_at = ?, last_status = ?, last_message = ? WHERE id = ?")
    .run(at, status, message, id);
}

const SEEDED_KEY = "profile_seeded";

/**
 * The first time a profile's data is loaded, set up its searches and rules
 * from the profile itself (skills, hourly rate). Runs once per profile, so
 * searches the user deletes later are not brought back. Returns a note for the
 * run log, or undefined when nothing was added.
 */
export function seedFromProfile(ctx: ProfileContext): string | undefined {
  if (kvGet(SEEDED_KEY)) return undefined;
  const seeds = searchesFromProfile(ctx.skills, listSearches());
  const settings = getSettings();
  const rules = rulesFromProfile(settings.rules, ctx.hourlyRate);
  transaction(() => {
    for (const s of seeds) createSearch(s.name, s.kind, s.params);
    kvSet(SEEDED_KEY, { at: nowIso(), searches: seeds.map((s) => s.name), minHourlyRate: rules.minHourlyRate });
  });
  if (rules !== settings.rules) {
    saveSettings({ rules });
    reapplyRules(rules);
  }
  const parts = [];
  if (seeds.length) parts.push(`added ${seeds.length} search(es): ${seeds.map((s) => s.name).join(", ")}`);
  if (rules !== settings.rules) parts.push(`min hourly rate set to your profile rate ($${rules.minHourlyRate}/hr)`);
  return parts.length ? `Set up from your profile: ${parts.join("; ")}.` : undefined;
}

/** Human-readable one-liner for a search's filters. */
export function describeParams(kind: SearchKind, p: Record<string, unknown>): string {
  if (kind === "smart") {
    const mode = p.mode === "best_match" ? "Best matches" : "Most recent";
    return p.days_posted ? `${mode}, posted in last ${p.days_posted} day(s)` : mode;
  }
  return Object.entries(p)
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
    .join(" · ");
}

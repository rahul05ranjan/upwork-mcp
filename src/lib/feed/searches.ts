import "server-only";
import { db } from "@/lib/db";

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

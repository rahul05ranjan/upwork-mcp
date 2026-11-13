import "server-only";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ACTIVE_PROFILE_KEY, currentOrg, LEGACY_DB, NoProfile, openProfileDb, profileDbExists, profileFile } from "@/lib/db";
import { sessionDelete, sessionGet, sessionSet } from "@/lib/store";

// The Upwork profile (org) the app is working as. Every saved job, search,
// draft and setting belongs to one profile and lives in that profile's own
// database, so disconnecting hides all of it and a different login never sees
// another profile's data.

export type ActiveProfile = { orgUid: string; label: string };

export type Account = { org_uid: string; name: string; role: string; role_label: string };

export function activeProfile(): ActiveProfile | undefined {
  return sessionGet<ActiveProfile>(ACTIVE_PROFILE_KEY);
}

/** The org uid for Upwork calls: the profile bound to this run, else the active one. */
export function requireOrg(): string {
  const org = currentOrg();
  if (!org) throw new NoProfile();
  return org;
}

export function setActiveProfile(p: ActiveProfile): void {
  adoptLegacyData(p.orgUid);
  sessionSet(ACTIVE_PROFILE_KEY, p);
  openProfileDb(p.orgUid); // creates the file and its tables
}

export function clearActiveProfile(): void {
  sessionDelete(ACTIVE_PROFILE_KEY);
}

function textJson(result: unknown): Record<string, unknown> {
  const content = (result as { content?: unknown }).content;
  const item = (Array.isArray(content) ? content : [])[0] as { text?: string } | undefined;
  return item?.text ? JSON.parse(item.text) : {};
}

export async function fetchAccounts(client: Client): Promise<Account[]> {
  const result = await client.callTool({ name: "upwork__list_accounts", arguments: {} });
  const accounts = textJson(result).accounts;
  return Array.isArray(accounts) ? (accounts as Account[]) : [];
}

export function accountLabel(a: Account): string {
  return `${a.name} (${a.role_label})`;
}

/**
 * Picks the profile right after login: the freelancer account if there is one.
 * Always asks Upwork, because the new login may be a different person.
 */
export async function selectProfileAfterLogin(client: Client): Promise<ActiveProfile> {
  const accounts = await fetchAccounts(client);
  const pick = accounts.find((a) => a.role === "TALENT") ?? accounts[0];
  if (!pick) throw new Error("Upwork returned no accounts for this login.");
  const profile = { orgUid: pick.org_uid, label: accountLabel(pick) };
  setActiveProfile(profile);
  return profile;
}

/**
 * Before profiles were split out, everything lived in .data/app.db. Copy it
 * once into the profile it belonged to (the org saved in its settings). The
 * old file is left untouched as a backup.
 */
function adoptLegacyData(orgUid: string): void {
  if (!existsSync(LEGACY_DB) || profileDbExists(orgUid)) return;
  const legacy = new DatabaseSync(LEGACY_DB, { readOnly: true });
  try {
    const row = legacy.prepare("SELECT value FROM kv WHERE key = 'settings'").get() as { value: string } | undefined;
    const owner = row ? (JSON.parse(row.value) as { orgUid?: string }).orgUid : undefined;
    if (owner !== orgUid) return;
    const target = profileFile(orgUid);
    mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    legacy.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  } finally {
    legacy.close();
  }
  // Login state belongs to the session now, not to a profile.
  openProfileDb(orgUid).prepare("DELETE FROM kv WHERE key = 'upwork-auth'").run();
}

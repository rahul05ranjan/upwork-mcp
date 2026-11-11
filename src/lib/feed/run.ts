import "server-only";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { db, nowIso, transaction } from "@/lib/db";
import { errorMessage } from "@/lib/http";
import { hasTokens } from "@/lib/upwork/auth-provider";
import { NeedsLogin, withUpwork } from "@/lib/upwork/client";
import { parseSearchResponse } from "./parse";
import { listSearches, recordSearchResult } from "./searches";
import { getSettings, saveSettings } from "./settings";
import { upsertJob } from "./jobs";
import { hasOpenAI } from "@/lib/ai/openai";
import { scorePending } from "@/lib/ai/score";
import { ensureProfileContext } from "@/lib/profile";

export type Account = { org_uid: string; name: string; role: string; role_label: string };

export type RunSummary = { found: number; newJobs: number; scored?: number; messages: string[] };

const PAUSE_MS = 750; // between Upwork calls, to stay well clear of throttling
const SCORE_PER_RUN = 30; // caps AI spend per run; the rest are scored next run

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

/** The org to search as; defaults to the freelancer account the first time. */
export async function resolveOrg(client: Client): Promise<string> {
  const settings = getSettings();
  if (settings.orgUid) return settings.orgUid;
  const accounts = await fetchAccounts(client);
  const pick = accounts.find((a) => a.role === "TALENT") ?? accounts[0];
  if (!pick) throw new Error("Upwork returned no accounts for this login.");
  saveSettings({ orgUid: pick.org_uid, orgLabel: `${pick.name} (${pick.role_label})` });
  return pick.org_uid;
}

async function runSearches(client: Client, trigger: string): Promise<RunSummary> {
  const settings = getSettings();
  const searches = listSearches().filter((s) => s.enabled);
  const summary: RunSummary = { found: 0, newJobs: 0, messages: [] };
  const startedAt = nowIso();
  const runId = Number(
    db().prepare("INSERT INTO runs (trigger, started_at) VALUES (?, ?)").run(trigger, startedAt).lastInsertRowid,
  );

  try {
    if (searches.length === 0) {
      summary.messages.push("No saved searches are enabled. Add one under Searches & rules.");
      return summary;
    }
    const orgUid = await resolveOrg(client);

    for (const search of searches) {
      const warnings: string[] = [];
      let found = 0;
      try {
        let cursor: string | undefined;
        for (let page = 0; page < settings.pagesPerSearch; page++) {
          const result = await client.callTool({
            name: "upwork__find_jobs",
            arguments: {
              action: search.kind === "smart" ? "smart_search" : "search",
              org_uid: orgUid,
              params: { ...search.params, limit: 10, ...(cursor ? { cursor } : {}) },
            },
          });
          const parsed = parseSearchResponse(result as { isError?: boolean; content?: unknown });
          warnings.push(...parsed.warnings);
          const now = nowIso();
          transaction(() => {
            for (const job of parsed.jobs) {
              if (upsertJob(job, search.id, settings.rules, now)) summary.newJobs++;
            }
          });
          found += parsed.jobs.length;
          if (!parsed.hasMore || !parsed.nextCursor) break;
          cursor = parsed.nextCursor;
          await new Promise((r) => setTimeout(r, PAUSE_MS));
        }
        summary.found += found;
        const note = [`${found} jobs`, ...warnings].join(" · ");
        recordSearchResult(search.id, warnings.length ? "warning" : "ok", note, nowIso());
        if (warnings.length) summary.messages.push(`${search.name}: ${warnings.join("; ")}`);
      } catch (err) {
        if (err instanceof NeedsLogin) throw err;
        recordSearchResult(search.id, "error", errorMessage(err), nowIso());
        summary.messages.push(`${search.name}: ${errorMessage(err)}`);
      }
    }

    if (hasOpenAI()) {
      try {
        const ctx = await ensureProfileContext(client, orgUid);
        const { scored, errors } = await scorePending(ctx, SCORE_PER_RUN);
        summary.scored = scored;
        if (errors.length) summary.messages.push(`AI scoring: ${errors.join("; ")}`);
      } catch (err) {
        summary.messages.push(`AI scoring: ${errorMessage(err)}`);
      }
    }
    return summary;
  } finally {
    db()
      .prepare("UPDATE runs SET finished_at = ?, found = ?, new_jobs = ?, messages = ? WHERE id = ?")
      .run(nowIso(), summary.found, summary.newJobs, JSON.stringify(summary.messages), runId);
  }
}

// One run at a time; a second trigger while running shares the first's result.
const g = globalThis as unknown as { __feedRun?: Promise<RunSummary> };

export function runFeed(trigger: "manual" | "schedule"): Promise<RunSummary> {
  g.__feedRun ??= (async () => {
    try {
      if (!(await hasTokens())) return { found: 0, newJobs: 0, messages: ["Not connected to Upwork."] };
      return await withUpwork((client) => runSearches(client, trigger));
    } catch (err) {
      const msg = err instanceof NeedsLogin ? "Upwork session expired. Click Connect Upwork at the top." : errorMessage(err);
      return { found: 0, newJobs: 0, messages: [msg] };
    } finally {
      g.__feedRun = undefined;
    }
  })();
  return g.__feedRun;
}

export function isFeedRunning(): boolean {
  return g.__feedRun !== undefined;
}

export type RunRow = { started_at: string; finished_at: string | null; found: number; new_jobs: number; messages: string[]; trigger: string };

export function lastRun(): RunRow | undefined {
  const r = db().prepare("SELECT * FROM runs ORDER BY id DESC LIMIT 1").get() as (Omit<RunRow, "messages"> & { messages: string }) | undefined;
  return r ? { ...r, messages: JSON.parse(r.messages) } : undefined;
}

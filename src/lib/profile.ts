import "server-only";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { nowIso } from "@/lib/db";
import { kvGet, kvSet } from "@/lib/store";
import { stripUntrustedTags } from "@/lib/feed/parse";

// What the AI knows about the freelancer. Upwork data is fetched read-only and
// cached; the writer notes are typed by the user on the settings page.

export type Highlight = { id: string; title: string; score?: number; startedOn?: string; endedOn?: string };

export type ProfileContext = {
  fetchedAt: string;
  title?: string;
  overview?: string;
  hourlyRate?: number;
  skills: string[];
  totals: { jobs?: number; feedback?: number; earnings?: string };
  employment: string[];
  languages: string[];
  portfolio: Highlight[];
  workHistory: Highlight[];
  certificates: Highlight[];
  pastProposals: { status: string; jobTitle?: string; coverLetter?: string }[];
  canSubmitProposals?: boolean;
};

export type WriterNotes = {
  /** Facts about the freelancer that are not on the Upwork profile. */
  about: string;
  /** Tone and structure preferences. */
  style: string;
  /** Pasted proposals that won work, used as style examples. */
  samples: string;
  /** How to sign off, e.g. "Best, Rahul". */
  signOff: string;
};

const CONTEXT_KEY = "profile_context";
const NOTES_KEY = "writer_notes";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const EMPTY_NOTES: WriterNotes = { about: "", style: "", samples: "", signOff: "" };

export function getWriterNotes(): WriterNotes {
  return { ...EMPTY_NOTES, ...kvGet<Partial<WriterNotes>>(NOTES_KEY) };
}

export function saveWriterNotes(notes: WriterNotes): void {
  kvSet(NOTES_KEY, notes);
}

export function getProfileContext(): ProfileContext | undefined {
  return kvGet<ProfileContext>(CONTEXT_KEY);
}

function textJson(result: unknown): Record<string, unknown> {
  const content = (result as { content?: unknown }).content;
  const item = (Array.isArray(content) ? content : [])[0] as { text?: string } | undefined;
  try {
    return item?.text ? JSON.parse(item.text) : {};
  } catch {
    return {};
  }
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
// Upwork wraps user-written profile text (title, overview…) in
// <untrusted_participant_content> tags too; keep only the text.
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? stripUntrustedTags(v) || undefined : undefined);

/** Finds the first string field whose name matches, a couple of levels deep. */
function findString(node: unknown, pattern: RegExp, depth = 0): string | undefined {
  if (depth > 3) return undefined;
  for (const [k, v] of Object.entries(obj(node))) {
    if (pattern.test(k) && typeof v === "string" && v) return v;
  }
  for (const v of Object.values(obj(node))) {
    if (v && typeof v === "object") {
      const hit = findString(v, pattern, depth + 1);
      if (hit) return hit;
    }
  }
  return undefined;
}

async function call(client: Client, name: string, orgUid: string, action: string, params?: Obj) {
  return textJson(await client.callTool({ name, arguments: { action, org_uid: orgUid, ...(params ? { params } : {}) } }));
}

export async function refreshProfileContext(client: Client, orgUid: string): Promise<ProfileContext> {
  const profile = await call(client, "upwork__get_profile", orgUid, "get");
  const highlights = await call(client, "upwork__get_profile", orgUid, "list_highlights");

  const data = obj(profile.data);
  const personal = obj(data.personalData);
  const aggregates = obj(data.profileAggregates);
  const rate = Number(obj(personal.chargeRate).rawValue);

  // Proposals that won or were at least submitted, strongest first.
  const pastProposals: ProfileContext["pastProposals"] = [];
  for (const status of ["Hired", "Offered", "Accepted"]) {
    if (pastProposals.length >= 6) break;
    const res = await call(client, "upwork__list_freelancer_proposals", orgUid, "list", { status, limit: 5 });
    const edges = arr(obj(obj(res.data).vendorProposals).edges);
    for (const e of edges) {
      const node = obj(obj(e).node ?? e);
      pastProposals.push({
        status,
        jobTitle: findString(node, /^title$/i),
        coverLetter: findString(node, /cover/i)?.slice(0, 2500),
      });
    }
  }

  const ctx: ProfileContext = {
    fetchedAt: nowIso(),
    title: str(personal.title),
    overview: str(personal.description),
    hourlyRate: Number.isFinite(rate) && rate > 0 ? rate : undefined,
    skills: arr(data.skills).map((s) => str(obj(s).prettyName) ?? str(obj(s).skill)).filter((s): s is string => !!s),
    totals: {
      jobs: typeof aggregates.totalJobs === "number" ? aggregates.totalJobs : undefined,
      feedback: typeof aggregates.totalFeedback === "number" ? aggregates.totalFeedback : undefined,
      earnings: str(aggregates.totalEarnings),
    },
    employment: arr(data.employmentRecords)
      .map((r) => [str(obj(r).jobTitle), str(obj(r).companyName)].filter(Boolean).join(" at "))
      .filter(Boolean),
    languages: arr(profile.languages)
      .map((l) => [str(obj(l).language_name), str(obj(l).proficiency_label)].filter(Boolean).join(" — "))
      .filter(Boolean),
    portfolio: arr(highlights.portfolio_projects).map((p) => ({ id: String(obj(p).id), title: str(obj(p).title) ?? "" })),
    workHistory: arr(highlights.work_history).map((w) => ({
      id: String(obj(w).id),
      title: str(obj(w).title) ?? "",
      score: typeof obj(obj(w).client_feedback).score === "number" ? (obj(obj(w).client_feedback).score as number) : undefined,
      startedOn: str(obj(w).started_on),
      endedOn: str(obj(w).ended_on),
    })),
    certificates: arr(highlights.certificates).map((c) => ({ id: String(obj(c).id), title: str(obj(c).name) ?? "" })),
    pastProposals,
    canSubmitProposals: obj(profile.identity_verification).can_submit_proposals as boolean | undefined,
  };
  kvSet(CONTEXT_KEY, ctx);
  return ctx;
}

/** Cached context, refreshed from Upwork when missing or older than a day. */
export async function ensureProfileContext(client: Client, orgUid: string): Promise<ProfileContext> {
  const cached = getProfileContext();
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < MAX_AGE_MS) return cached;
  return refreshProfileContext(client, orgUid);
}

/** The freelancer facts handed to the model, as compact JSON. */
export function profileForPrompt(ctx: ProfileContext, opts: { overviewChars: number }) {
  return {
    title: ctx.title,
    overview: ctx.overview?.slice(0, opts.overviewChars),
    hourly_rate_usd: ctx.hourlyRate,
    skills: ctx.skills,
    completed_upwork_jobs: ctx.totals.jobs,
    feedback_score: ctx.totals.feedback,
    total_earnings: ctx.totals.earnings,
    employment: ctx.employment,
    languages: ctx.languages,
    portfolio_projects: ctx.portfolio,
    past_upwork_contracts: ctx.workHistory,
    certificates: ctx.certificates,
  };
}

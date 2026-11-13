import "server-only";
import { nowIso } from "@/lib/db";
import { getJob, saveJobDetails } from "@/lib/feed/jobs";
import { addDraft, latestDraft } from "@/lib/feed/drafts";
import { requireOrg } from "@/lib/session";
import { ensureProfileContext, refreshProfileContext } from "@/lib/profile";
import { withUpwork } from "@/lib/upwork/client";
import { generateDraft } from "./draft";
import { DRAFT_MODEL } from "./openai";
import { scorePending } from "./score";

const DETAILS_MAX_AGE_MS = 6 * 60 * 60 * 1000;

function textJson(result: unknown): Record<string, unknown> {
  const content = (result as { content?: unknown; isError?: boolean }).content;
  const text = ((Array.isArray(content) ? content : [])[0] as { text?: string } | undefined)?.text ?? "";
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(text.slice(0, 300) || "Upwork returned no data");
  }
  if ((result as { isError?: boolean }).isError || (body.status && body.status !== "ok")) {
    const code = typeof body.error_code === "string" ? body.error_code : "";
    if (code === "JOB_BROWSE_COOLDOWN") throw new Error("Upwork is cooling down job-detail requests. Try again in about a minute.");
    const msg = body.error ?? body.message;
    throw new Error(typeof msg === "string" && msg ? msg : code || JSON.stringify(msg ?? body).slice(0, 300));
  }
  return body;
}

export async function scoreNow() {
  return withUpwork(async (client) => {
    const org = requireOrg();
    const ctx = await ensureProfileContext(client, org);
    return scorePending(ctx, 50);
  });
}

export async function refreshProfile() {
  return withUpwork(async (client) => refreshProfileContext(client, requireOrg()));
}

/** Full job details from Upwork; cached for a few hours to respect its browse throttle. */
export async function refreshJobDetails(jobId: string, force = false) {
  const job = getJob(jobId);
  if (!job) throw new Error("Job not found");
  if (!force && job.details && job.details_fetched_at && Date.now() - Date.parse(job.details_fetched_at) < DETAILS_MAX_AGE_MS) {
    return job.details;
  }
  return withUpwork(async (client) => {
    const org = requireOrg();
    const result = await client.callTool({ name: "upwork__find_jobs", arguments: { action: "get", org_uid: org, params: { id: jobId } } });
    const details = textJson(result);
    saveJobDetails(jobId, details, nowIso());
    return details;
  });
}

/** Writes a new AI draft version for a job. */
export async function draftJob(jobId: string, instructions?: string) {
  const job = getJob(jobId);
  if (!job) throw new Error("Job not found");

  const details = await refreshJobDetails(jobId).catch(() => job.details ?? undefined);
  const ctx = await withUpwork(async (client) => ensureProfileContext(client, requireOrg()));
  const previous = instructions ? latestDraft(jobId)?.cover_letter : undefined;

  const { draft, usage } = await generateDraft({ job: job.raw, details: details ?? undefined, ctx, instructions, previous });
  return addDraft({
    jobId,
    source: "ai",
    coverLetter: draft.cover_letter,
    bidAmount: draft.bid_amount,
    bidRationale: draft.bid_rationale,
    highlights: draft.highlights,
    notes: draft.notes_for_freelancer,
    instructions: instructions ?? null,
    model: DRAFT_MODEL,
    inputTokens: usage?.input_tokens ?? null,
    outputTokens: usage?.output_tokens ?? null,
  });
}

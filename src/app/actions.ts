"use server";

import { refresh } from "next/cache";
import { PROPOSAL_TIERS, type Rules } from "@/lib/feed/parse";
import { reapplyRules, setJobStatus } from "@/lib/feed/jobs";
import { runFeed, type RunSummary } from "@/lib/feed/run";
import { createSearch, deleteSearch, setSearchEnabled } from "@/lib/feed/searches";
import { getSettings, saveSettings } from "@/lib/feed/settings";
import { addDraft, latestDraft } from "@/lib/feed/drafts";
import { COVER_LETTER_MAX } from "@/lib/ai/draft";
import { draftJob, refreshJobDetails, refreshProfile, scoreNow } from "@/lib/ai/workflow";
import { saveWriterNotes } from "@/lib/profile";
import { saveManualHealth } from "@/lib/health-data";
import {
  acknowledgeProposalPolicy,
  answersForSubmission,
  checkUpload,
  confirmSubmission,
  prepareSubmission,
  refreshOutcomes,
  startUpload,
} from "@/lib/submit";
import { resolveUnknown, setReplied } from "@/lib/submissions";
import { NeedsLogin } from "@/lib/upwork/client";

// Local single-user app: Next.js already rejects cross-origin Server Action
// calls. Add a login check here before hosting it anywhere public.

export type FormState = { error?: string; ok?: string };

function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function positive(form: FormData, key: string): number | undefined {
  const s = str(form, key);
  if (!s) return undefined;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`"${key.replace(/_/g, " ")}" must be a number above 0`);
  return n;
}

function wholeNumber(form: FormData, key: string): number | undefined {
  const s = str(form, key);
  if (!s) return undefined;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 0) throw new Error(`"${key.replace(/_/g, " ")}" must be a whole number`);
  return n;
}

function list(form: FormData, key: string): string[] {
  return str(form, key)
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function compact(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== "" && v !== false));
}

export async function runNowAction(): Promise<RunSummary> {
  const summary = await runFeed("manual");
  refresh();
  return summary;
}

export async function setJobStatusAction(form: FormData): Promise<void> {
  const id = str(form, "id");
  const status = str(form, "status");
  if (!id || !["new", "shortlisted", "skipped"].includes(status)) return;
  setJobStatus(id, status as "new" | "shortlisted" | "skipped");
  refresh();
}

export async function createSearchAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    const name = str(form, "name");
    const kind = str(form, "kind") === "smart" ? "smart" : "search";
    if (!name) return { error: "Give the search a name." };

    let params: Record<string, unknown>;
    if (kind === "smart") {
      const mode = str(form, "mode") === "best_match" ? "best_match" : "most_recent";
      const days = wholeNumber(form, "days_posted");
      params = compact({ mode, days_posted: mode === "most_recent" && days ? days : undefined });
    } else {
      const title = str(form, "title");
      const query = str(form, "query");
      const skills = list(form, "skills");
      if (title && query) return { error: "Use either Title words or Keywords, not both (Upwork refuses the combination)." };
      if (!title && !query && skills.length === 0) return { error: "Add title words, keywords or at least one skill." };
      if (skills.length > 5) return { error: "Upwork accepts at most 5 skills per search." };
      if (title && title.split(/\s+/).length > 3) return { error: "Keep title words to 1–3 words; Upwork ANDs them." };
      const jobType = str(form, "job_type");
      const level = str(form, "experience_level");
      params = compact({
        title: title || undefined,
        query: query || undefined,
        skills: skills.length ? skills : undefined,
        job_type: ["fixed", "hourly"].includes(jobType) ? jobType : undefined,
        experience_level: ["entry_level", "intermediate", "expert"].includes(level) ? level : undefined,
        rate_min: positive(form, "rate_min"),
        budget_min: positive(form, "budget_min"),
        proposals_max: wholeNumber(form, "proposals_max"),
        client_hires_min: wholeNumber(form, "client_hires_min"),
        location: str(form, "location") || undefined,
        verified_payment_only: form.get("verified_payment_only") === "on",
        sort: "recency",
      });
    }
    createSearch(name, kind, params);
    refresh();
    return { ok: `Saved "${name}".` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

// ---- AI (Phase 3) ----

export async function scoreNowAction(): Promise<string> {
  try {
    const { scored, errors } = await scoreNow();
    refresh();
    return errors.length ? `Scored ${scored}. Errors: ${errors.join("; ")}` : `Scored ${scored} job(s).`;
  } catch (err) {
    return errorText(err);
  }
}

export async function refreshProfileAction(): Promise<FormState> {
  try {
    const ctx = await refreshProfile();
    refresh();
    return {
      ok: `Loaded profile: ${ctx.skills.length} skills, ${ctx.portfolio.length} portfolio projects, ${ctx.workHistory.length} past contracts, ${ctx.pastProposals.length} past proposals.`,
    };
  } catch (err) {
    return { error: errorText(err) };
  }
}

export async function saveWriterNotesAction(_prev: FormState, form: FormData): Promise<FormState> {
  saveWriterNotes({
    about: str(form, "about").slice(0, 6000),
    style: str(form, "style").slice(0, 2000),
    samples: str(form, "samples").slice(0, 10000),
    signOff: str(form, "sign_off").slice(0, 200),
  });
  refresh();
  return { ok: "Writer notes saved." };
}

export async function generateDraftAction(_prev: FormState, form: FormData): Promise<FormState> {
  const jobId = str(form, "job_id");
  try {
    const version = await draftJob(jobId, str(form, "instructions") || undefined);
    refresh();
    return { ok: `Draft v${version} written.` };
  } catch (err) {
    return { error: errorText(err) };
  }
}

export async function saveDraftAction(_prev: FormState, form: FormData): Promise<FormState> {
  const jobId = str(form, "job_id");
  const letter = str(form, "cover_letter");
  if (!letter) return { error: "The cover letter is empty." };
  if (letter.length > COVER_LETTER_MAX) return { error: `Upwork allows ${COVER_LETTER_MAX} characters; this is ${letter.length}.` };
  const bidRaw = str(form, "bid_amount");
  const bid = bidRaw ? Number(bidRaw) : null;
  if (bid !== null && (!Number.isFinite(bid) || bid <= 0)) return { error: "Bid must be a number above 0." };

  const ids = (key: string) => form.getAll(key).filter((v): v is string => typeof v === "string");
  const base = latestDraft(jobId);
  const version = addDraft({
    jobId,
    source: "user",
    coverLetter: letter,
    bidAmount: bid,
    bidRationale: base?.bid_rationale,
    highlights: {
      portfolio_project_ids: ids("portfolio_project_ids"),
      work_history_ids: ids("work_history_ids"),
      certificate_ids: ids("certificate_ids"),
    },
    notes: base?.notes,
  });
  refresh();
  return { ok: `Saved as v${version}.` };
}

export async function refreshDetailsAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await refreshJobDetails(str(form, "job_id"), true);
    refresh();
    return { ok: "Job details refreshed." };
  } catch (err) {
    return { error: errorText(err) };
  }
}

function errorText(err: unknown): string {
  if (err instanceof NeedsLogin) return "Upwork session expired. Click Connect Upwork at the top.";
  return err instanceof Error ? err.message : String(err);
}

// ---- Submitting (Phase 4) ----

export type SubmitFormState = FormState & { kind?: string };

export async function prepareSubmissionAction(_prev: SubmitFormState, form: FormData): Promise<SubmitFormState> {
  const jobId = str(form, "job_id");
  const questions = form.getAll("question").map((q) => String(q));
  const answers = form.getAll("answer").map((a) => String(a));
  const boostRaw = str(form, "boost_connects");
  const method = str(form, "application_method");
  const duration = str(form, "estimated_duration");
  const mode = str(form, "payment_mode");
  try {
    const res = await prepareSubmission(jobId, {
      answers: questions.map((q, i) => ({ question: q, answer: (answers[i] ?? "").trim() })),
      boostConnects: boostRaw ? Number(boostRaw) : undefined,
      attachments: list(form, "attachments"),
      applicationMethod: method === "cover_letter" || method === "ai_interview" ? method : undefined,
      estimatedDuration: ["less_than_1_month", "1_to_3_months", "3_to_6_months", "more_than_6_months"].includes(duration) ? duration : undefined,
      paymentMode: mode === "by_project" || mode === "by_milestone" ? mode : undefined,
    });
    refresh();
    return res.ok ? { ok: "Upwork preview ready. Nothing has been sent yet." } : { error: res.error, kind: res.kind };
  } catch (err) {
    return { error: errorText(err) };
  }
}

export async function confirmSubmissionAction(_prev: SubmitFormState, form: FormData): Promise<SubmitFormState> {
  try {
    const res = await confirmSubmission(Number(str(form, "submission_id")), {
      connects: form.get("ack_connects") === "on",
      attachments: form.get("ack_attachments") === "on",
    });
    refresh();
    return res.ok ? { ok: "Submitted to Upwork." } : { error: res.error, kind: res.unknown ? "unknown" : undefined };
  } catch (err) {
    return { error: errorText(err) };
  }
}

export async function draftAnswersAction(submissionId: number): Promise<{ answers?: { question: string; answer: string }[]; error?: string }> {
  try {
    return { answers: await answersForSubmission(submissionId) };
  } catch (err) {
    return { error: errorText(err) };
  }
}

export async function startUploadAction(jobTitle: string): Promise<{ taskId?: string; url?: string; error?: string }> {
  try {
    return await startUpload(jobTitle);
  } catch (err) {
    return { error: errorText(err) };
  }
}

export async function checkUploadAction(taskId: string): Promise<{ status?: string; fileUids?: string[]; error?: string }> {
  try {
    return await checkUpload(taskId);
  } catch (err) {
    return { error: errorText(err) };
  }
}

export async function acknowledgePolicyAction(): Promise<FormState> {
  try {
    await acknowledgeProposalPolicy();
    return { ok: "Policy acknowledged. Get the preview again." };
  } catch (err) {
    return { error: errorText(err) };
  }
}

export async function resolveUnknownAction(form: FormData): Promise<void> {
  resolveUnknown(Number(str(form, "submission_id")), str(form, "submitted") === "1");
  refresh();
}

export async function refreshOutcomesAction(): Promise<FormState> {
  try {
    const { checked } = await refreshOutcomes();
    refresh();
    return { ok: `Checked ${checked} proposal(s) on Upwork.` };
  } catch (err) {
    return { error: errorText(err) };
  }
}

export async function setRepliedAction(form: FormData): Promise<void> {
  const v = str(form, "replied");
  setReplied(Number(str(form, "submission_id")), v === "1" ? true : v === "0" ? false : null);
  refresh();
}

// ---- Profile health ----

export async function saveHealthManualAction(_prev: FormState, form: FormData): Promise<FormState> {
  const tri = (key: string) => {
    const v = str(form, key);
    return v === "yes" ? true : v === "no" ? false : undefined;
  };
  saveManualHealth({
    complete100: tri("complete100"),
    hireAgain90: tri("hireAgain90"),
    responseTimeShown: tri("responseTimeShown"),
    activeContract: tri("activeContract"),
  });
  refresh();
  return { ok: "Saved." };
}

// ---- Searches ----

export async function toggleSearchAction(form: FormData): Promise<void> {
  setSearchEnabled(Number(str(form, "id")), str(form, "enabled") === "1");
  refresh();
}

export async function deleteSearchAction(form: FormData): Promise<void> {
  deleteSearch(Number(str(form, "id")));
  refresh();
}

export async function saveSettingsAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    const interval = wholeNumber(form, "interval_minutes") ?? 0;
    if (interval !== 0 && interval < 10) return { error: "Run at most every 10 minutes (or 0 to turn it off)." };
    const pages = wholeNumber(form, "pages_per_search") ?? 1;
    if (pages < 1 || pages > 5) return { error: "Pages per search must be 1–5." };

    const minRating = positive(form, "min_client_rating");
    if (minRating !== undefined && minRating > 5) return { error: "Client rating is out of 5." };

    const rules: Rules = {
      minHourlyRate: positive(form, "min_hourly_rate"),
      minFixedBudget: positive(form, "min_fixed_budget"),
      minClientSpend: positive(form, "min_client_spend"),
      minClientRating: minRating,
      requireVerifiedPayment: form.get("require_verified_payment") === "on",
      skipIfHired: form.get("skip_if_hired") === "on",
      excludeProposalTiers: form.getAll("exclude_tiers").filter((t): t is string => typeof t === "string" && PROPOSAL_TIERS.includes(t)),
      excludeKeywords: list(form, "exclude_keywords"),
      excludeCountries: list(form, "exclude_countries"),
    };

    const maxPerProposal = wholeNumber(form, "max_connects_per_proposal") ?? 30;
    const maxPerDay = wholeNumber(form, "max_connects_per_day") ?? 60;
    const winRate = positive(form, "win_rate_percent") ?? 3;
    if (winRate > 100) return { error: "Win rate is a percentage (0–100)." };

    const orgUid = str(form, "org_uid");
    const orgLabel = str(form, "org_label_" + orgUid);
    const current = getSettings();
    saveSettings({
      intervalMinutes: interval,
      pagesPerSearch: pages,
      rules,
      maxConnectsPerProposal: maxPerProposal,
      maxConnectsPerDay: maxPerDay,
      winRatePercent: winRate,
      ...(orgUid ? { orgUid, orgLabel: orgLabel || current.orgLabel } : {}),
    });
    reapplyRules(rules);
    refresh();
    return { ok: "Settings saved. Stored jobs were re-checked against the new rules." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

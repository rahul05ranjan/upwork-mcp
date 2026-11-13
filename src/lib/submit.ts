import "server-only";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { draftScreeningAnswers } from "@/lib/ai/answers";
import { COVER_LETTER_MAX } from "@/lib/ai/draft";
import { checkConnects } from "@/lib/boost";
import { errorMessage } from "@/lib/http";
import { latestDraft } from "@/lib/feed/drafts";
import { getJob } from "@/lib/feed/jobs";
import { parseBudget } from "@/lib/feed/parse";
import { requireOrg } from "@/lib/session";
import { getSettings } from "@/lib/feed/settings";
import { rateVsBudget } from "@/lib/health";
import { ensureProfileContext, getProfileContext } from "@/lib/profile";
import { findKey, needsConnects, needsPolicyAck, parsePreview, previewExpired } from "@/lib/proposal-preview";
import {
  claimForSubmit,
  connectsSpentLast24h,
  getSubmission,
  latestSubmission,
  listSentSubmissions,
  markFailed,
  markSubmitted,
  markUnknown,
  recordPreview,
  updateOutcome,
} from "@/lib/submissions";
import { withUpwork } from "@/lib/upwork/client";
import {
  acknowledgePolicy,
  callRead,
  confirmPreview,
  requestPreview,
  startProposalUpload,
  type CreateParams,
} from "@/lib/upwork/proposals";

export type PrepareInputs = {
  answers?: { question: string; answer: string }[];
  boostConnects?: number;
  attachments?: string[];
  applicationMethod?: "cover_letter" | "ai_interview";
  estimatedDuration?: string;
  paymentMode?: "by_project" | "by_milestone";
};

export type PrepareResult =
  | { ok: true; submissionId: number }
  | { ok: false; error: string; kind?: "connects" | "policy" | "already_applied" | "fixed_terms" };

const PROPOSAL_STATUSES = ["Accepted", "Pending", "Activated", "Offered", "Hired"];

/** Upwork's mandatory checks before create: an invitation for this job, or an existing proposal. */
async function preCheck(client: Client, orgUid: string, jobId: string) {
  const inv = await callRead(client, "upwork__list_freelancer_proposals", "invitations", orgUid, { job_posting_id: jobId });
  const invitations = (findKey(inv.body, "invitations") as unknown[] | undefined) ?? [];
  const invite = invitations.find((i) => JSON.stringify(i).includes(jobId)) as Record<string, unknown> | undefined;

  for (const status of PROPOSAL_STATUSES) {
    const res = await callRead(client, "upwork__list_freelancer_proposals", "list", orgUid, { status, limit: 25 });
    const edges = (findKey(res.body, "edges") as unknown[] | undefined) ?? [];
    if (edges.some((e) => JSON.stringify(e).includes(jobId))) return { existing: status };
  }
  return { invitationUid: typeof invite?.id === "string" ? invite.id : undefined };
}

export async function prepareSubmission(jobId: string, inputs: PrepareInputs): Promise<PrepareResult> {
  const job = getJob(jobId);
  if (!job) return { ok: false, error: "Job not found." };
  if (job.status === "applied" || job.raw.applied) return { ok: false, kind: "already_applied", error: "You already applied to this job." };
  const draft = latestDraft(jobId);
  if (!draft) return { ok: false, error: "Write or save a draft first." };
  if (!draft.cover_letter.trim() || draft.cover_letter.length > COVER_LETTER_MAX) {
    return { ok: false, error: `The cover letter must be 1–${COVER_LETTER_MAX} characters.` };
  }
  if (!draft.bid_amount || draft.bid_amount <= 0) return { ok: false, error: "Set a bid amount in the draft and save it." };
  if (inputs.boostConnects !== undefined && (!Number.isInteger(inputs.boostConnects) || inputs.boostConnects < 1)) {
    return { ok: false, error: "Boost must be a whole number of Connects, at least 1." };
  }
  // Upwork won't build a fixed-price preview without these; ask here instead of
  // spending a round trip on its "next_step" reply.
  if (job.job_type === "fixed") {
    if (!inputs.estimatedDuration) {
      return { ok: false, kind: "fixed_terms", error: "This is a fixed-price job: choose how long the work will take." };
    }
    if (inputs.paymentMode !== "by_project") {
      return {
        ok: false,
        kind: "fixed_terms",
        error:
          inputs.paymentMode === "by_milestone"
            ? "Milestone payments aren't supported here yet. Choose By project."
            : "This is a fixed-price job: choose how you want to be paid.",
      };
    }
  }

  return withUpwork(async (client) => {
    const orgUid = requireOrg();
    const check = await preCheck(client, orgUid, jobId);
    if ("existing" in check && check.existing) {
      return { ok: false, kind: "already_applied", error: `Upwork already has a proposal from you for this job (status: ${check.existing}).` } as const;
    }
    const invitationUid = "invitationUid" in check ? check.invitationUid : undefined;
    const kind = invitationUid ? "proposal_accept_invitation" : "proposal";

    const params: CreateParams = {
      ...(invitationUid ? { invitation_uid: invitationUid, bid: draft.bid_amount! } : { job_reference: jobId, charged_amount: draft.bid_amount! }),
      cover_letter: draft.cover_letter,
      answers: inputs.answers?.filter((a) => a.answer.trim()),
      boost_connects: inputs.boostConnects,
      attachments: inputs.attachments,
      application_method: inputs.applicationMethod,
      ...(job.job_type === "fixed" ? { estimated_duration: inputs.estimatedDuration, payment_mode: inputs.paymentMode } : {}),
      ...(invitationUid
        ? {}
        : {
            certificate_ids: draft.highlights.certificate_ids,
            portfolio_project_ids: draft.highlights.portfolio_project_ids,
            work_history_ids: draft.highlights.work_history_ids,
          }),
    };

    const reply = await requestPreview(client, orgUid, kind, params);
    if (reply.isError) {
      const text = reply.text || "Upwork refused the preview.";
      if (needsConnects(text)) return { ok: false, kind: "connects", error: text } as const;
      if (needsPolicyAck(text)) return { ok: false, kind: "policy", error: text } as const;
      return { ok: false, error: text } as const;
    }
    const preview = parsePreview(reply.body);
    if (!preview.previewId) {
      // Upwork asks for missing details with a "next_step" reply instead of a preview.
      const nextStep = findKey(reply.body, "next_step");
      if (typeof nextStep === "string" && nextStep) {
        return { ok: false, error: `Upwork needs more details before it builds a preview: ${nextStep}` } as const;
      }
      return { ok: false, error: `Upwork returned no preview_id: ${reply.text.slice(0, 500)}` } as const;
    }

    const budget = parseBudget(job.budget_text ?? undefined);
    const rate = job.job_type === "hourly" ? rateVsBudget(getProfileContext()?.hourlyRate, budget.min, budget.max) : undefined;
    const submissionId = recordPreview({
      jobId,
      draftId: draft.id,
      kind,
      invitationUid,
      params,
      previewId: preview.previewId,
      previewRaw: reply.body,
      connectsCost: preview.connectsCost,
      proposalsTier: job.proposals_tier,
      rateRatio: rate?.ratio ?? null,
    });
    return { ok: true, submissionId } as const;
  });
}

export type ConfirmResult = { ok: true } | { ok: false; error: string; unknown?: boolean };

/** The user's Approve click. Re-checks everything, then submits once. */
export async function confirmSubmission(submissionId: number, acknowledged: { connects: boolean; attachments: boolean }): Promise<ConfirmResult> {
  const s = getSubmission(submissionId);
  if (!s || !s.preview || !s.preview_id) return { ok: false, error: "Preview not found." };
  if (s.status !== "previewed") return { ok: false, error: `This preview is ${s.status}.` };
  if (previewExpired(s.preview)) return { ok: false, error: "This Upwork preview has expired (they last about 15 minutes). Get a new preview, then approve." };
  const latest = latestSubmission(s.job_id);
  if (latest?.id !== s.id) return { ok: false, error: "There is a newer preview for this job; approve that one." };
  if (!acknowledged.connects) return { ok: false, error: "Confirm the Connects cost first." };
  if (!acknowledged.attachments) return { ok: false, error: "Answer the attachments question first." };
  if (s.preview.canApply === false) return { ok: false, error: "Upwork says you can't apply to this job right now." };

  const answered = new Set((s.params.answers ?? []).map((a) => a.question.trim()));
  const missing = s.preview.screeningQuestions.filter((q) => !answered.has(q.trim()));
  if (missing.length) return { ok: false, error: `Answer the screening questions and update the preview first (${missing.length} missing).` };

  const settings = getSettings();
  const limitError = checkConnects({
    cost: s.preview.connectsCost ?? 0,
    boost: s.params.boost_connects ?? 0,
    balance: s.preview.connectsBalance,
    spentLast24h: connectsSpentLast24h(),
    limits: { maxPerProposal: settings.maxConnectsPerProposal, maxPerDay: settings.maxConnectsPerDay },
  });
  if (limitError) return { ok: false, error: limitError };

  if (!claimForSubmit(s.id)) return { ok: false, error: "This preview was already used, or another submission for this job is in progress." };

  let reply;
  try {
    reply = await withUpwork((client) => confirmPreview(client, requireOrg(), s.kind, s.preview_id!));
  } catch (err) {
    // We can't tell whether Upwork accepted it: keep the row blocking retries.
    markUnknown(s.id, `Outcome unknown: ${errorMessage(err)}. Check your proposals on Upwork before retrying.`);
    return { ok: false, unknown: true, error: `Couldn't confirm the outcome: ${errorMessage(err)}. Check Upwork before doing anything else.` };
  }

  if (reply.isError) {
    markFailed(s.id, reply.text || "Upwork refused the submission.");
    return { ok: false, error: reply.text || "Upwork refused the submission." };
  }
  const proposalId = findKey(reply.body, "proposal_id") ?? findKey(reply.body, "proposalId");
  markSubmitted(s.id, reply.body ?? reply.text, typeof proposalId === "string" ? proposalId : null);
  return { ok: true };
}

export async function acknowledgeProposalPolicy() {
  const reply = await withUpwork(async (client) => acknowledgePolicy(client, requireOrg()));
  if (reply.isError) throw new Error(reply.text || "Upwork refused the acknowledgement.");
}

export async function startUpload(jobTitle: string) {
  const reply = await withUpwork(async (client) =>
    startProposalUpload(client, requireOrg(), `Files to attach to your proposal for "${jobTitle.slice(0, 80)}"`),
  );
  if (reply.isError) throw new Error(reply.text || "Upwork refused the upload session.");
  const taskId = findKey(reply.body, "task_id");
  const url = findKey(reply.body, "fallback_url");
  if (typeof taskId !== "string" || typeof url !== "string") throw new Error("Upwork returned no upload link.");
  return { taskId, url, expiresAt: (findKey(reply.body, "expires_at") as string | undefined) ?? null };
}

export async function checkUpload(taskId: string) {
  const reply = await withUpwork(async (client) =>
    callRead(client, "upwork__get_upload_status", "get", requireOrg(), { task_id: taskId }),
  );
  if (reply.isError) throw new Error(reply.text || "Couldn't read the upload status.");
  const files = (findKey(reply.body, "files") as unknown[] | undefined) ?? [];
  const uids = new Set<string>();
  const direct = findKey(reply.body, "file_uids");
  if (Array.isArray(direct)) direct.forEach((u) => typeof u === "string" && uids.add(u));
  for (const f of files) {
    const uid = findKey(f, "file_uid");
    if (typeof uid === "string") uids.add(uid);
  }
  const single = findKey(reply.body, "file_uid");
  if (typeof single === "string") uids.add(single);
  return { status: String(findKey(reply.body, "status") ?? "unknown"), fileUids: [...uids] };
}

export async function answersForSubmission(submissionId: number) {
  const s = getSubmission(submissionId);
  if (!s?.preview?.screeningQuestions.length) return [];
  const job = getJob(s.job_id);
  if (!job) throw new Error("Job not found");
  const ctx = await withUpwork(async (client) => ensureProfileContext(client, requireOrg()));
  return draftScreeningAnswers(job.raw, s.preview.screeningQuestions, ctx, s.params.cover_letter);
}

/** Reads viewed / status for sent proposals back from Upwork (read-only). */
export async function refreshOutcomes(): Promise<{ checked: number }> {
  const sent = listSentSubmissions().filter((s) => s.status === "submitted");
  if (!sent.length) return { checked: 0 };
  return withUpwork(async (client) => {
    const orgUid = requireOrg();
    // One pass over recent proposals per status, matched to our jobs by id.
    const nodes: unknown[] = [];
    for (const status of PROPOSAL_STATUSES) {
      const res = await callRead(client, "upwork__list_freelancer_proposals", "list", orgUid, { status, limit: 25 });
      for (const e of ((findKey(res.body, "edges") as unknown[] | undefined) ?? [])) nodes.push({ status, edge: e });
    }
    let checked = 0;
    for (const s of sent) {
      const hit = nodes.find((n) => JSON.stringify(n).includes(s.job_id)) as { status: string; edge: unknown } | undefined;
      if (!hit) continue;
      const viewed = findKey(hit.edge, "viewedByClient");
      const label = findKey(hit.edge, "status_label");
      const id = findKey(hit.edge, "id");
      updateOutcome(s.id, {
        viewed: typeof viewed === "boolean" ? viewed : undefined,
        upworkStatus: typeof label === "string" ? label : hit.status,
        proposalId: typeof id === "string" ? id : undefined,
      });
      checked++;
    }
    return { checked };
  });
}

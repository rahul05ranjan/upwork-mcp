import "server-only";
import { db, nowIso, transaction } from "@/lib/db";
import { parsePreview, type ProposalPreview } from "@/lib/proposal-preview";
import type { CreateParams } from "@/lib/upwork/proposals";

export type SubmissionStatus = "previewed" | "submitting" | "submitted" | "failed" | "superseded";

export type Submission = {
  id: number;
  job_id: string;
  draft_id: number | null;
  kind: "proposal" | "proposal_accept_invitation";
  invitation_uid: string | null;
  params: CreateParams;
  preview_id: string | null;
  preview: ProposalPreview | null;
  preview_raw: unknown;
  connects_cost: number | null;
  boost_connects: number | null;
  status: SubmissionStatus;
  error: string | null;
  result: unknown;
  proposal_id: string | null;
  proposals_tier: string | null;
  rate_ratio: number | null;
  viewed: boolean | null;
  replied: boolean | null;
  upwork_status: string | null;
  outcome_checked_at: string | null;
  created_at: string;
  submitted_at: string | null;
};

type Row = Record<string, unknown>;

function fromRow(r: Row): Submission {
  const raw = r.preview ? JSON.parse(r.preview as string) : null;
  return {
    ...(r as unknown as Submission),
    params: JSON.parse(r.params as string),
    preview: raw ? parsePreview(raw) : null,
    preview_raw: raw,
    result: r.result ? JSON.parse(r.result as string) : null,
    viewed: r.viewed === null || r.viewed === undefined ? null : r.viewed === 1,
    replied: r.replied === null || r.replied === undefined ? null : r.replied === 1,
  };
}

export function getSubmission(id: number): Submission | undefined {
  const r = db().prepare("SELECT * FROM submissions WHERE id = ?").get(id) as Row | undefined;
  return r ? fromRow(r) : undefined;
}

export function latestSubmission(jobId: string): Submission | undefined {
  const r = db().prepare("SELECT * FROM submissions WHERE job_id = ? ORDER BY id DESC LIMIT 1").get(jobId) as Row | undefined;
  return r ? fromRow(r) : undefined;
}

export function listSentSubmissions(): (Submission & { title: string; url: string | null })[] {
  const rows = db()
    .prepare(
      `SELECT s.*, j.title, j.url FROM submissions s JOIN jobs j ON j.id = s.job_id
       WHERE s.status IN ('submitted', 'submitting') ORDER BY s.submitted_at DESC, s.id DESC`,
    )
    .all() as Row[];
  return rows.map((r) => ({ ...fromRow(r), title: r.title as string, url: (r.url as string) ?? null }));
}

export function recordPreview(s: {
  jobId: string;
  draftId: number | null;
  kind: Submission["kind"];
  invitationUid?: string;
  params: CreateParams;
  previewId: string;
  previewRaw: unknown;
  connectsCost?: number;
  proposalsTier?: string | null;
  rateRatio?: number | null;
}): number {
  return transaction(() => {
    db().prepare("UPDATE submissions SET status = 'superseded' WHERE job_id = ? AND status = 'previewed'").run(s.jobId);
    return Number(
      db()
        .prepare(
          `INSERT INTO submissions (job_id, draft_id, kind, invitation_uid, params, preview_id, preview, connects_cost,
             boost_connects, status, proposals_tier, rate_ratio, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'previewed', ?, ?, ?)`,
        )
        .run(
          s.jobId,
          s.draftId,
          s.kind,
          s.invitationUid ?? null,
          JSON.stringify(s.params),
          s.previewId,
          JSON.stringify(s.previewRaw),
          s.connectsCost ?? null,
          s.params.boost_connects ?? null,
          s.proposalsTier ?? null,
          s.rateRatio ?? null,
          nowIso(),
        ).lastInsertRowid,
    );
  });
}

/**
 * Atomically claims a previewed row for submission. Returns false if it was
 * already claimed, superseded, or another submission for the job is live.
 */
export function claimForSubmit(id: number): boolean {
  try {
    const res = db()
      .prepare(
        `UPDATE submissions SET status = 'submitting', error = NULL
         WHERE id = ? AND status = 'previewed'
           AND id = (SELECT MAX(s2.id) FROM submissions s2 WHERE s2.job_id = submissions.job_id)`,
      )
      .run(id);
    return res.changes === 1;
  } catch {
    return false; // unique index: another submission for this job is in flight or sent
  }
}

export function markSubmitted(id: number, result: unknown, proposalId: string | null): void {
  transaction(() => {
    const at = nowIso();
    db()
      .prepare("UPDATE submissions SET status = 'submitted', result = ?, proposal_id = ?, submitted_at = ? WHERE id = ?")
      .run(JSON.stringify(result ?? null), proposalId, at, id);
    db().prepare("UPDATE jobs SET status = 'applied' WHERE id = (SELECT job_id FROM submissions WHERE id = ?)").run(id);
  });
}

export function markFailed(id: number, error: string): void {
  db().prepare("UPDATE submissions SET status = 'failed', error = ? WHERE id = ?").run(error.slice(0, 2000), id);
}

/** Keeps the row 'submitting' (blocking retries) when we can't tell whether Upwork accepted it. */
export function markUnknown(id: number, error: string): void {
  db().prepare("UPDATE submissions SET error = ? WHERE id = ?").run(error.slice(0, 2000), id);
}

export function resolveUnknown(id: number, submitted: boolean): void {
  if (submitted) markSubmitted(id, { resolvedByUser: true }, null);
  else markFailed(id, "Marked as not submitted by you after checking Upwork.");
}

export function connectsSpentLast24h(): number {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const r = db()
    .prepare(
      `SELECT COALESCE(SUM(COALESCE(connects_cost, 0) + COALESCE(boost_connects, 0)), 0) AS n
       FROM submissions WHERE status IN ('submitted', 'submitting') AND COALESCE(submitted_at, created_at) >= ?`,
    )
    .get(since) as { n: number };
  return r.n;
}

export function updateOutcome(id: number, o: { viewed?: boolean; upworkStatus?: string; proposalId?: string }): void {
  db()
    .prepare(
      `UPDATE submissions SET viewed = COALESCE(?, viewed), upwork_status = COALESCE(?, upwork_status),
         proposal_id = COALESCE(proposal_id, ?), outcome_checked_at = ? WHERE id = ?`,
    )
    .run(o.viewed === undefined ? null : o.viewed ? 1 : 0, o.upworkStatus ?? null, o.proposalId ?? null, nowIso(), id);
}

export function setReplied(id: number, replied: boolean | null): void {
  db().prepare("UPDATE submissions SET replied = ? WHERE id = ?").run(replied === null ? null : replied ? 1 : 0, id);
}

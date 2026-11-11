import "server-only";
import { db, nowIso } from "@/lib/db";

export type Highlights = { portfolio_project_ids: string[]; work_history_ids: string[]; certificate_ids: string[] };
export const NO_HIGHLIGHTS: Highlights = { portfolio_project_ids: [], work_history_ids: [], certificate_ids: [] };

export type Draft = {
  id: number;
  job_id: string;
  version: number;
  source: "ai" | "user";
  cover_letter: string;
  bid_amount: number | null;
  bid_rationale: string | null;
  highlights: Highlights;
  notes: string[];
  instructions: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
};

type Row = Omit<Draft, "highlights" | "notes"> & { highlights: string; notes: string };

function fromRow(r: Row): Draft {
  return { ...r, highlights: { ...NO_HIGHLIGHTS, ...JSON.parse(r.highlights) }, notes: JSON.parse(r.notes) };
}

export function listDrafts(jobId: string): Draft[] {
  return (db().prepare("SELECT * FROM drafts WHERE job_id = ? ORDER BY version DESC").all(jobId) as Row[]).map(fromRow);
}

export function latestDraft(jobId: string): Draft | undefined {
  const r = db().prepare("SELECT * FROM drafts WHERE job_id = ? ORDER BY version DESC LIMIT 1").get(jobId) as Row | undefined;
  return r ? fromRow(r) : undefined;
}

export function addDraft(d: {
  jobId: string;
  source: "ai" | "user";
  coverLetter: string;
  bidAmount: number | null;
  bidRationale?: string | null;
  highlights: Highlights;
  notes?: string[];
  instructions?: string | null;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
}): number {
  const { v } = db().prepare("SELECT COALESCE(MAX(version), 0) + 1 AS v FROM drafts WHERE job_id = ?").get(d.jobId) as { v: number };
  db()
    .prepare(
      `INSERT INTO drafts (job_id, version, source, cover_letter, bid_amount, bid_rationale, highlights, notes,
         instructions, model, input_tokens, output_tokens, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      d.jobId,
      v,
      d.source,
      d.coverLetter,
      d.bidAmount,
      d.bidRationale ?? null,
      JSON.stringify(d.highlights),
      JSON.stringify(d.notes ?? []),
      d.instructions ?? null,
      d.model ?? null,
      d.inputTokens ?? null,
      d.outputTokens ?? null,
      nowIso(),
    );
  return v;
}

/** Token totals per model, for the cost line on the settings page. */
export function tokenUsage(): { model: string; input: number; output: number; calls: number }[] {
  // node:sqlite rows have a null prototype, which React can't pass to client
  // components, so copy them into plain objects.
  const rows = db()
    .prepare(
      `SELECT model, SUM(input) AS input, SUM(output) AS output, SUM(calls) AS calls FROM (
         SELECT model, COALESCE(SUM(input_tokens), 0) AS input, COALESCE(SUM(output_tokens), 0) AS output, COUNT(*) AS calls
           FROM job_scores GROUP BY model
         UNION ALL
         SELECT model, COALESCE(SUM(input_tokens), 0), COALESCE(SUM(output_tokens), 0), COUNT(*)
           FROM drafts WHERE source = 'ai' GROUP BY model
       ) GROUP BY model ORDER BY calls DESC`,
    )
    .all() as { model: string; input: number; output: number; calls: number }[];
  return rows.map((r) => ({ model: r.model, input: r.input, output: r.output, calls: r.calls }));
}

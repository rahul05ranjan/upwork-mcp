import "server-only";
import { db, transaction } from "@/lib/db";
import { evaluateRules, parseBudget, type Rules, type UpworkClient, type UpworkJob } from "./parse";

export type JobStatus = "new" | "shortlisted" | "skipped" | "applied";
export type JobView = JobStatus | "filtered";
export const JOB_VIEWS: JobView[] = ["new", "shortlisted", "skipped", "applied", "filtered"];

export type JobRow = {
  id: string;
  title: string;
  url: string | null;
  snippet: string | null;
  job_type: string | null;
  budget_text: string | null;
  experience_level: string | null;
  duration: string | null;
  proposals_tier: string | null;
  skills: string[];
  client: UpworkClient;
  job_activity: UpworkJob["job_activity"];
  published_date: string | null;
  status: JobStatus;
  rule_reject: string | null;
  first_seen_at: string;
  sources: string[];
  score: ScoreRow | null;
};

export type ScoreRow = {
  score: number;
  verdict: "strong" | "maybe" | "weak";
  summary: string;
  reasons: string[];
  red_flags: string[];
  model: string;
};

const SELECT_JOB = `
  SELECT j.*,
    (SELECT json_group_array(s.name) FROM job_sources js JOIN searches s ON s.id = js.search_id WHERE js.job_id = j.id) AS sources,
    (SELECT json_object('score', sc.score, 'verdict', sc.verdict, 'summary', sc.summary,
                        'reasons', json(sc.reasons), 'red_flags', json(sc.red_flags), 'model', sc.model)
       FROM job_scores sc WHERE sc.job_id = j.id) AS score_json
  FROM jobs j`;

function toJobRow(r: Record<string, unknown>): JobRow {
  return {
    ...(r as unknown as JobRow),
    skills: JSON.parse(r.skills as string),
    client: JSON.parse(r.client as string),
    job_activity: JSON.parse(r.job_activity as string),
    sources: JSON.parse((r.sources as string) ?? "[]"),
    score: r.score_json ? (JSON.parse(r.score_json as string) as ScoreRow) : null,
  };
}

/** Inserts or refreshes a job. Keeps the user's status; returns true if new. */
export function upsertJob(job: UpworkJob, searchId: number, rules: Rules, now: string): boolean {
  const d = db();
  const existed = d.prepare("SELECT 1 FROM jobs WHERE id = ?").get(job.id) !== undefined;
  const budget = parseBudget(job.budget);
  d.prepare(
    `INSERT INTO jobs (id, title, url, snippet, job_type, budget_text, budget_min, budget_max, experience_level,
       duration, engagement, proposals_tier, skills, client, job_activity, applied, created_date, published_date,
       status, rule_reject, first_seen_at, last_seen_at, raw)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       title = excluded.title, url = excluded.url, snippet = excluded.snippet, budget_text = excluded.budget_text,
       budget_min = excluded.budget_min, budget_max = excluded.budget_max, proposals_tier = excluded.proposals_tier,
       client = excluded.client, job_activity = excluded.job_activity, applied = excluded.applied,
       rule_reject = excluded.rule_reject, last_seen_at = excluded.last_seen_at, raw = excluded.raw,
       status = CASE WHEN excluded.applied = 1 THEN 'applied' ELSE jobs.status END`,
  ).run(
    job.id,
    job.title,
    job.url ?? null,
    job.description_snippet ?? null,
    job.job_type ?? null,
    job.budget ?? null,
    budget.min ?? null,
    budget.max ?? null,
    job.experience_level ?? null,
    job.duration ?? null,
    job.engagement ?? null,
    job.proposals_tier ?? (job.proposal_count !== undefined ? String(job.proposal_count) : null),
    JSON.stringify(job.skills ?? []),
    JSON.stringify(job.client ?? {}),
    JSON.stringify(job.job_activity ?? {}),
    job.applied ? 1 : 0,
    job.created_date ?? null,
    job.published_date ?? null,
    job.applied ? "applied" : "new",
    evaluateRules(job, rules),
    now,
    now,
    JSON.stringify(job),
  );
  d.prepare("INSERT OR IGNORE INTO job_sources (job_id, search_id) VALUES (?, ?)").run(job.id, searchId);
  return !existed;
}

/** Re-checks every stored job after the rules change. */
export function reapplyRules(rules: Rules): void {
  transaction(() => {
    const d = db();
    const update = d.prepare("UPDATE jobs SET rule_reject = ? WHERE id = ?");
    for (const row of d.prepare("SELECT id, raw FROM jobs").all() as { id: string; raw: string }[]) {
      update.run(evaluateRules(JSON.parse(row.raw) as UpworkJob, rules), row.id);
    }
  });
}

function viewWhere(view: JobView): string {
  if (view === "filtered") return "j.rule_reject IS NOT NULL AND j.status != 'applied'";
  if (view === "applied") return "j.status = 'applied'";
  return `j.status = '${view}' AND j.rule_reject IS NULL`;
}

export type JobSort = "score" | "newest";

export function listJobs(view: JobView, sort: JobSort = "score", limit = 100): JobRow[] {
  const order =
    sort === "score"
      ? "(SELECT sc.score FROM job_scores sc WHERE sc.job_id = j.id) DESC NULLS LAST, COALESCE(j.published_date, j.first_seen_at) DESC"
      : "COALESCE(j.published_date, j.first_seen_at) DESC";
  const rows = db()
    .prepare(`${SELECT_JOB} WHERE ${viewWhere(view)} ORDER BY ${order} LIMIT ?`)
    .all(limit) as Record<string, unknown>[];
  return rows.map(toJobRow);
}

export type JobDetail = JobRow & {
  raw: UpworkJob;
  details: Record<string, unknown> | null;
  details_fetched_at: string | null;
};

export function getJob(id: string): JobDetail | undefined {
  const r = db().prepare(`${SELECT_JOB} WHERE j.id = ?`).get(id) as Record<string, unknown> | undefined;
  if (!r) return undefined;
  return {
    ...toJobRow(r),
    raw: JSON.parse(r.raw as string),
    details: r.details ? JSON.parse(r.details as string) : null,
    details_fetched_at: (r.details_fetched_at as string) ?? null,
  };
}

export function saveJobDetails(id: string, details: Record<string, unknown>, at: string): void {
  db().prepare("UPDATE jobs SET details = ?, details_fetched_at = ? WHERE id = ?").run(JSON.stringify(details), at, id);
}

export function countJobs(): Record<JobView, number> {
  const counts = Object.fromEntries(JOB_VIEWS.map((v) => [v, 0])) as Record<JobView, number>;
  for (const v of JOB_VIEWS) {
    counts[v] = (db().prepare(`SELECT COUNT(*) AS n FROM jobs j WHERE ${viewWhere(v)}`).get() as { n: number }).n;
  }
  return counts;
}

export function setJobStatus(id: string, status: Exclude<JobStatus, "applied">): void {
  db().prepare("UPDATE jobs SET status = ? WHERE id = ? AND status != 'applied'").run(status, id);
}

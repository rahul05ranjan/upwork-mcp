import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { hasOpenAI, DRAFT_MODEL } from "@/lib/ai/openai";
import { refreshJobDetails } from "@/lib/ai/workflow";
import { listDrafts } from "@/lib/feed/drafts";
import { getJob } from "@/lib/feed/jobs";
import { parseBudget, stripUntrustedTags } from "@/lib/feed/parse";
import { rateVsBudget } from "@/lib/health";
import { timeAgo } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { getProfileContext } from "@/lib/profile";
import { setJobStatusAction } from "../../actions";
import { ScoreBadge } from "../../score-badge";
import { DraftPanel } from "./draft-panel";
import { SubmitPanel, type SubmissionView } from "./submit-panel";
import { getSettings } from "@/lib/feed/settings";
import { evaluateHealth } from "@/lib/health";
import { healthInputs } from "@/lib/health-data";
import { connectsSpentLast24h, latestSubmission, type Submission } from "@/lib/submissions";

/** Only plain, serializable fields go to the client. */
function submissionView(s: Submission | undefined): SubmissionView | null {
  if (!s) return null;
  return {
    id: s.id,
    status: s.status,
    error: s.error,
    kind: s.kind,
    params: s.params,
    preview: s.preview,
    preview_raw: s.preview_raw,
    boost_connects: s.boost_connects,
    draft_id: s.draft_id,
    submitted_at: s.submitted_at,
    connects_cost: s.connects_cost,
  };
}

export default function JobPage({ params }: PageProps<"/jobs/[id]">) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <Link href="/" className="text-sm text-zinc-500 hover:underline">
        ← Jobs
      </Link>
      <Suspense fallback={<p className="mt-4 text-sm text-zinc-500">Loading job…</p>}>
        <JobView params={params} />
      </Suspense>
    </main>
  );
}

type AnyObj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function JobView({ params }: Pick<PageProps<"/jobs/[id]">, "params">) {
  await connection();
  const { id } = await params;
  let job = getJob(id);
  if (!job) notFound();

  // Full details once per few hours (cached); search results only carry a snippet.
  let detailsError: string | undefined;
  if (!job.details) {
    try {
      await refreshJobDetails(id);
      job = getJob(id)!;
    } catch (err) {
      detailsError = errorMessage(err);
    }
  }

  const d = (job.details ?? {}) as AnyObj;
  const posting = d.data?.marketplaceJobPosting ?? {};
  const description = stripUntrustedTags(posting.content?.description ?? job.snippet ?? "");
  const record = d.client_record as AnyObj | undefined;
  const quals = d.preferred_qualifications as AnyObj | undefined;
  const reviews = (d.client_feedback?.reviews ?? []) as AnyObj[];
  const drafts = listDrafts(id);
  const ctx = getProfileContext();
  const settings = getSettings();
  const budget = parseBudget(job.budget_text ?? undefined);
  const rate = job.job_type === "hourly" ? rateVsBudget(ctx?.hourlyRate, budget.min, budget.max) : undefined;

  return (
    <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className="min-w-0 space-y-5">
        <div className="flex items-start gap-3">
          {job.score && <ScoreBadge score={job.score.score} verdict={job.score.verdict} />}
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">{job.title}</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {job.job_type === "hourly" ? "Hourly" : "Fixed"} · {job.budget_text ?? "no budget stated"}
              {job.experience_level && ` · ${job.experience_level}`}
              {job.proposals_tier && ` · Proposals: ${job.proposals_tier}`}
              {job.published_date && ` · Posted ${timeAgo(job.published_date)}`}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
              {job.url && (
                <a href={job.url} target="_blank" rel="noopener noreferrer" className="text-emerald-700 hover:underline dark:text-emerald-400">
                  Open on Upwork ↗
                </a>
              )}
              {job.status !== "applied" && (
                <form action={setJobStatusAction} className="flex gap-1.5">
                  <input type="hidden" name="id" value={job.id} />
                  {job.status !== "shortlisted" && (
                    <button name="status" value="shortlisted" className="rounded-md border border-emerald-300 px-2.5 py-1 text-xs text-emerald-800 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300">
                      Shortlist
                    </button>
                  )}
                  {job.status !== "skipped" && (
                    <button name="status" value="skipped" className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
                      Skip
                    </button>
                  )}
                </form>
              )}
              <span className="text-xs text-zinc-400">Status: {job.status}</span>
            </div>
          </div>
        </div>

        {job.score && (
          <div className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
            <p className="font-medium">AI fit: {job.score.summary}</p>
            {job.score.reasons.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-zinc-600 dark:text-zinc-400">
                {job.score.reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            )}
            {job.score.red_flags.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-amber-700 dark:text-amber-400">
                {job.score.red_flags.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            )}
          </div>
        )}

        {rate && (
          <p
            className={`rounded-md border px-3 py-2 text-sm ${
              rate.verdict === "below"
                ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                : "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
            }`}
          >
            Your profile rate (${ctx?.hourlyRate}/hr) is {rate.ratio.toFixed(2)}× this job&apos;s posted rate (~${rate.typical}/hr).{" "}
            {rate.verdict === "below"
              ? "In the Get Seen study, below-typical profile rates reached page one 13 in 100 vs 30 at or above. Your profile rate counts for ranking, not your bid."
              : "At or above the typical applicant, which helps your place in the list."}
          </p>
        )}

        {detailsError && (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            Couldn&apos;t load full details: {detailsError}. Showing the search snippet.
          </p>
        )}

        <div>
          <h2 className="mb-1 text-sm font-semibold">Description</h2>
          <p className="whitespace-pre-line text-sm text-zinc-700 dark:text-zinc-300">{description || "—"}</p>
        </div>

        {job.skills.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {job.skills.map((s) => (
              <span key={s} className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{s}</span>
            ))}
          </div>
        )}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800 sm:grid-cols-3">
          <Stat label="Connects to apply" value={d.connects_cost} />
          <Stat label="Your Connects" value={d.connects_balance} />
          <Stat label="Can apply" value={d.can_apply === undefined ? undefined : d.can_apply ? "Yes" : "No"} />
          <Stat label="Client country" value={posting.clientCompanyPublic?.country?.name ?? job.client.country} />
          <Stat label="Client spend" value={record?.spend_total ?? job.client.total_spent} />
          <Stat label="Hire rate" value={record?.hire_rate_percent !== undefined ? `${record.hire_rate_percent}%` : undefined} />
          <Stat label="Client feedback" value={record?.feedback_score !== undefined ? `${record.feedback_score} (${record.feedback_count})` : undefined} />
          <Stat label="Jobs posted" value={record?.jobs_posted} />
          <Stat label="Open jobs" value={record?.open_jobs} />
        </dl>

        {quals && Object.keys(quals).length > 0 && (
          <div>
            <h2 className="mb-1 text-sm font-semibold">Client&apos;s preferred qualifications</h2>
            <ul className="text-sm text-zinc-600 dark:text-zinc-400">
              {Object.entries(quals).map(([k, v]) => (
                <li key={k}>
                  {k.replace(/_/g, " ")}: {String(v)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {reviews.length > 0 && (
          <div>
            <h2 className="mb-1 text-sm font-semibold">What freelancers said about this client</h2>
            <ul className="space-y-2 text-sm">
              {reviews.map((r, i) => (
                <li key={i} className="text-zinc-600 dark:text-zinc-400">
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">★ {r.score}</span> {r.title && `· ${r.title}`}
                  {r.comment && <span className="block">{stripUntrustedTags(r.comment)}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="min-w-0">
        <DraftPanel
          jobId={job.id}
          isHourly={job.job_type === "hourly"}
          aiReady={hasOpenAI()}
          model={DRAFT_MODEL}
          drafts={drafts}
          highlights={{
            portfolio: ctx?.portfolio ?? [],
            workHistory: ctx?.workHistory ?? [],
            certificates: ctx?.certificates ?? [],
          }}
          detailsFetchedAt={job.details_fetched_at}
        />
        <SubmitPanel
          jobId={job.id}
          jobTitle={job.title}
          isFixed={job.job_type !== "hourly"}
          proposalsTier={job.proposals_tier}
          latestDraftId={drafts[0]?.id ?? null}
          latestDraftBid={drafts[0]?.bid_amount ?? null}
          submission={submissionView(latestSubmission(job.id))}
          limits={{ maxPerProposal: settings.maxConnectsPerProposal, maxPerDay: settings.maxConnectsPerDay }}
          spent24h={connectsSpentLast24h()}
          winRatePercent={settings.winRatePercent}
          healthMet={evaluateHealth(healthInputs().inputs).met}
        />
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="font-medium">{value === undefined || value === null || value === "" ? "—" : String(value)}</dd>
    </div>
  );
}

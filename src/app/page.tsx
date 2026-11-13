import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { countJobs, JOB_VIEWS, listJobs, type JobRow, type JobSort, type JobView } from "@/lib/feed/jobs";
import { hasOpenAI } from "@/lib/ai/openai";
import { timeAgo } from "@/lib/format";
import { ScoreBadge, ScoreBreakdown } from "./score-badge";
import { ScoreNowButton } from "./score-now-button";
import { parseBudget, parseMoney, stripUntrustedTags } from "@/lib/feed/parse";
import { rateVsBudget } from "@/lib/health";
import { getProfileContext } from "@/lib/profile";
import { lastRun } from "@/lib/feed/run";
import { listSearches } from "@/lib/feed/searches";
import { setJobStatusAction } from "./actions";
import { RunNowButton } from "./run-now-button";
import { Gated } from "./profile-gate";

const VIEW_LABELS: Record<JobView, string> = {
  new: "New",
  shortlisted: "Shortlisted",
  skipped: "Skipped",
  applied: "Applied",
  filtered: "Filtered out",
};

export default function JobsPage({ searchParams }: PageProps<"/">) {
  return (
    <Gated>
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <Suspense fallback={<p className="text-sm text-zinc-500">Loading jobs…</p>}>
          <Jobs searchParams={searchParams} />
        </Suspense>
      </main>
    </Gated>
  );
}

async function Jobs({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  await connection();
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;
  const view = (JOB_VIEWS as string[]).includes(params.view as string) ? (params.view as JobView) : "new";
  // Newest first by default: on Upwork the earliest proposals get seen most.
  const sort: JobSort = params.sort === "score" ? "score" : "newest";

  const counts = countJobs();
  const jobs = listJobs(view, sort);
  const unscored = jobs.filter((j) => !j.score && !j.rule_reject && j.status !== "skipped").length;
  const myRate = getProfileContext()?.hourlyRate;
  const run = lastRun();
  const hasSearches = listSearches().some((s) => s.enabled);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
          <p className="text-sm text-zinc-500">
            {run
              ? `Last run ${timeAgo(run.started_at)} (${run.trigger}): ${run.found} found, ${run.new_jobs} new.`
              : "No runs yet."}
          </p>
          {run && run.messages.length > 0 && (
            <ul className="mt-1 text-xs text-amber-700 dark:text-amber-400">
              {run.messages.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {hasOpenAI() && unscored > 0 && <ScoreNowButton count={unscored} />}
          <RunNowButton />
        </div>
      </div>

      {error && (
        <p className="mb-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {!hasSearches && (
        <p className="mb-6 rounded-md border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
          Start by adding a saved search on <Link href="/settings" className="font-medium underline">Searches &amp; rules</Link>.
        </p>
      )}

      <nav className="mb-4 flex flex-wrap items-end gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {JOB_VIEWS.map((v) => (
          <Link
            key={v}
            href={viewHref(v, sort)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              v === view
                ? "border-emerald-600 font-medium text-zinc-900 dark:text-zinc-100"
                : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            }`}
          >
            {VIEW_LABELS[v]} <span className="text-xs text-zinc-400">{counts[v]}</span>
          </Link>
        ))}
        <span className="ml-auto pb-2 text-xs text-zinc-500">
          Sort:{" "}
          {(["newest", "score"] as const).map((s) => (
            <Link
              key={s}
              href={viewHref(view, s)}
              className={`ml-1 rounded px-1.5 py-0.5 ${s === sort ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100" : "hover:underline"}`}
            >
              {s === "score" ? "Best fit" : "Newest"}
            </Link>
          ))}
        </span>
      </nav>

      {jobs.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-500">Nothing here yet.</p>
      ) : (
        <ul className="space-y-3">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} view={view} myRate={myRate} />
          ))}
        </ul>
      )}
    </>
  );
}

function JobCard({ job, view, myRate }: { job: JobRow; view: JobView; myRate?: number }) {
  const c = job.client;
  const budget = parseBudget(job.budget_text ?? undefined);
  const rate = job.job_type === "hourly" ? rateVsBudget(myRate, budget.min, budget.max) : undefined;
  const spent = parseMoney(c.total_spent);
  const hired = job.job_activity?.total_hired ?? 0;
  const interviewing = job.job_activity?.invited_to_interview ?? 0;

  return (
    <li className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {job.score && <ScoreBadge score={job.score.score} verdict={job.score.verdict} />}
        <div className="min-w-0 flex-1">
          <a
            href={job.url ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-zinc-900 hover:text-emerald-700 hover:underline dark:text-zinc-100 dark:hover:text-emerald-400"
          >
            {job.title}
          </a>
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              {job.job_type === "hourly" ? "Hourly" : "Fixed"}
              {job.budget_text ? ` · ${/^\d/.test(job.budget_text) ? "$" : ""}${job.budget_text}` : ""}
            </span>
            {job.experience_level && <span className="capitalize">{job.experience_level.replace(/_/g, " ")}</span>}
            {job.duration && <span>{job.duration}</span>}
            {job.proposals_tier && <span>Proposals: {job.proposals_tier}</span>}
            {rate && (
              <span
                className={rate.verdict === "below" ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"}
                title="Your profile hourly rate against this job's posted rate"
              >
                Your rate {rate.ratio.toFixed(1)}× budget
              </span>
            )}
            {(hired > 0 || interviewing > 0) && (
              <span className="text-amber-700 dark:text-amber-400">
                {hired > 0 ? `${hired} hired` : `${interviewing} interviewing`}
              </span>
            )}
            {job.published_date && <span>Posted {timeAgo(job.published_date)}</span>}
          </p>
        </div>
        <StatusButtons job={job} view={view} />
      </div>

      {job.score && (
        <p className="mt-2 text-sm text-zinc-800 dark:text-zinc-200">
          <span className="font-medium">AI:</span> {job.score.summary}
          {job.score.red_flags.length > 0 && (
            <span className="text-amber-700 dark:text-amber-400"> · ⚠ {job.score.red_flags.join(" · ")}</span>
          )}
        </p>
      )}
      {job.score?.breakdown && <ScoreBreakdown breakdown={job.score.breakdown} />}

      {job.snippet && (
        <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-zinc-600 dark:text-zinc-400">
          {stripUntrustedTags(job.snippet)}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
        <span>
          Client: {c.country ?? "?"}
          {spent !== undefined && ` · $${Math.round(spent).toLocaleString()} spent`}
          {c.total_reviews ? ` · ★ ${c.rating?.toFixed(2)} (${c.total_reviews})` : " · no reviews"}
          {c.verification_status === "VERIFIED" ? " · payment verified" : " · payment unverified"}
        </span>
        {job.sources.length > 0 && <span className="text-zinc-400">via {job.sources.join(", ")}</span>}
        <Link href={`/jobs/${job.id}`} className="ml-auto font-medium text-emerald-700 hover:underline dark:text-emerald-400">
          {job.status === "shortlisted" ? "Draft proposal →" : "Details →"}
        </Link>
      </div>

      {job.skills.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {job.skills.slice(0, 8).map((s) => (
            <span key={s} className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {s}
            </span>
          ))}
        </div>
      )}

      {view === "filtered" && job.rule_reject && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">Filtered out: {job.rule_reject}</p>
      )}
    </li>
  );
}

function StatusButtons({ job, view }: { job: JobRow; view: JobView }) {
  if (job.status === "applied") return <span className="text-xs font-medium text-emerald-700">Applied</span>;
  const btn =
    "rounded-md border border-zinc-300 px-2.5 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800";
  return (
    <form action={setJobStatusAction} className="flex gap-1.5">
      <input type="hidden" name="id" value={job.id} />
      {view !== "shortlisted" && view !== "filtered" && (
        <button name="status" value="shortlisted" className={`${btn} border-emerald-300 text-emerald-800 dark:border-emerald-800 dark:text-emerald-300`}>
          Shortlist
        </button>
      )}
      {view !== "skipped" && view !== "filtered" && (
        <button name="status" value="skipped" className={btn}>
          Skip
        </button>
      )}
      {(view === "shortlisted" || view === "skipped") && (
        <button name="status" value="new" className={btn}>
          Move to New
        </button>
      )}
    </form>
  );
}

function viewHref(view: JobView, sort: JobSort): string {
  const q = new URLSearchParams();
  if (view !== "new") q.set("view", view);
  if (sort !== "newest") q.set("sort", sort);
  const s = q.toString();
  return s ? `/?${s}` : "/";
}


"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { boostAdvice, checkConnects } from "@/lib/boost";
import type { Submission } from "@/lib/submissions";
import {
  acknowledgePolicyAction,
  checkUploadAction,
  confirmSubmissionAction,
  draftAnswersAction,
  prepareSubmissionAction,
  resolveUnknownAction,
  startUploadAction,
  type FormState,
  type SubmitFormState,
} from "../../actions";
import { FormMessage, inputClass, submitClass } from "../../settings/fields";
import { LocalTime } from "../../local-time";

export type SubmissionView = Pick<
  Submission,
  "id" | "status" | "error" | "kind" | "params" | "preview" | "preview_raw" | "boost_connects" | "draft_id" | "submitted_at" | "connects_cost"
>;

type Props = {
  /** The profile this page was rendered for; Approve is refused if another profile is active by then. */
  orgUid: string;
  jobId: string;
  jobTitle: string;
  isFixed: boolean;
  /** The client's duration estimate, e.g. "3 to 6 months". */
  jobDuration: string | null;
  proposalsTier: string | null;
  latestDraftId: number | null;
  latestDraftBid: number | null;
  submission: SubmissionView | null;
  limits: { maxPerProposal: number; maxPerDay: number };
  spent24h: number;
  winRatePercent: number;
  healthMet: number;
};

const BUY_CONNECTS = "https://www.upwork.com/nx/plans/connects/";

/** Upwork's posted duration ("3 to 6 months") as an estimated_duration value. */
function durationFromJob(text: string | null): string {
  const t = (text ?? "").toLowerCase();
  if (t.includes("less than 1")) return "less_than_1_month";
  if (t.includes("1 to 3")) return "1_to_3_months";
  if (t.includes("3 to 6")) return "3_to_6_months";
  if (t.includes("more than 6")) return "more_than_6_months";
  return "";
}

export function SubmitPanel(p: Props) {
  const s = p.submission;

  if (s?.status === "submitted") {
    return (
      <Box>
        <p className="font-medium text-emerald-700 dark:text-emerald-400">
          ✓ Submitted to Upwork {s.submitted_at && <LocalTime iso={s.submitted_at} />}
        </p>
        <p className="text-sm text-zinc-500">
          {s.connects_cost ?? "?"} Connects{s.boost_connects ? ` + ${s.boost_connects} boost bid` : ""}. Track it in{" "}
          <Link href="/proposals" className="underline">
            Proposals
          </Link>
          .
        </p>
      </Box>
    );
  }

  if (s?.status === "submitting") {
    return (
      <Box>
        <p className="font-medium text-amber-700 dark:text-amber-400">Outcome unknown</p>
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">{s.error ?? "A submission is in progress."}</p>
        <p className="mb-2 text-sm">Check your proposals on Upwork, then tell the app what happened:</p>
        <form action={resolveUnknownAction} className="flex gap-2">
          <input type="hidden" name="submission_id" value={s.id} />
          <button name="submitted" value="1" className={submitClass}>
            It was submitted
          </button>
          <button name="submitted" value="0" className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">
            It was not submitted
          </button>
        </form>
      </Box>
    );
  }

  if (!p.latestDraftId) {
    return (
      <Box>
        <p className="text-sm text-zinc-500">Write or save a draft above first.</p>
      </Box>
    );
  }

  // A new preview resets the form to what was actually sent.
  return <PrepareAndApprove key={s?.id ?? "none"} {...p} />;
}

function PrepareAndApprove(p: Props) {
  const s = p.submission;
  const preview = s?.status === "previewed" || s?.status === "failed" ? s.preview : null;
  const questions = preview?.screeningQuestions ?? [];
  const prevAnswers = new Map((s?.params.answers ?? []).map((a) => [a.question, a.answer]));

  const [answers, setAnswers] = useState<string[]>(questions.map((q) => prevAnswers.get(q) ?? ""));
  const [boost, setBoost] = useState<string>(s?.params.boost_connects ? String(s.params.boost_connects) : "");
  const [attachMode, setAttachMode] = useState<"" | "none" | "files">(s?.params.attachments?.length ? "files" : "");
  const [fileUids, setFileUids] = useState<string[]>(s?.params.attachments ?? []);
  const [method, setMethod] = useState<string>(s?.params.application_method ?? "");
  // Fixed-price jobs always need both; start from the client's own duration estimate.
  const [duration, setDuration] = useState<string>(s?.params.estimated_duration ?? (p.isFixed ? durationFromJob(p.jobDuration) : ""));
  const [mode, setMode] = useState<string>(s?.params.payment_mode ?? (p.isFixed ? "by_project" : ""));
  const [profit, setProfit] = useState<string>(String(Math.round((p.latestDraftBid ?? 0) * (p.isFixed ? 1 : 20))));
  const [upload, setUpload] = useState<{ taskId: string; url: string } | null>(null);
  const [uploadMsg, setUploadMsg] = useState<string>();
  const [answersMsg, setAnswersMsg] = useState<string>();
  const [busy, startTransition] = useTransition();

  const [prepState, prepare, preparing] = useActionState<SubmitFormState, FormData>(prepareSubmissionAction, {});
  const [confState, confirmAction, confirming] = useActionState<SubmitFormState, FormData>(confirmSubmissionAction, {});
  const [policyState, ackPolicy, acking] = useActionState<FormState, FormData>(acknowledgePolicyAction, {});

  const boostNum = boost ? Number(boost) : 0;
  const cost = preview?.connectsCost ?? 0;

  // The preview is only valid for exactly what was sent; any change needs a new one.
  const dirty =
    !s ||
    s.status !== "previewed" ||
    s.draft_id !== p.latestDraftId ||
    answers.some((a, i) => a.trim() !== (prevAnswers.get(questions[i]) ?? "").trim()) ||
    (s.params.boost_connects ?? 0) !== boostNum ||
    JSON.stringify(s.params.attachments ?? []) !== JSON.stringify(attachMode === "files" ? fileUids : []) ||
    (s.params.application_method ?? "") !== method ||
    (s.params.estimated_duration ?? "") !== duration ||
    (s.params.payment_mode ?? "") !== mode;

  const limitError = preview
    ? checkConnects({ cost, boost: boostNum, balance: preview.connectsBalance, spentLast24h: p.spent24h, limits: p.limits })
    : null;
  const advice =
    preview?.boost?.available && boostNum > 0
      ? boostAdvice({ boostConnects: boostNum, winRate: p.winRatePercent / 100, jobProfitUsd: Number(profit) || 0, healthMet: p.healthMet, proposalsTier: p.proposalsTier ?? undefined })
      : null;
  const unanswered = questions.filter((_, i) => !answers[i]?.trim()).length;

  return (
    <Box>
      <div>
        <h2 className="text-lg font-semibold">Submit to Upwork</h2>
        <p className="text-sm text-zinc-500">
          Step 1: get Upwork&apos;s preview (free, nothing is sent). Step 2: review it and approve. Only Approve spends Connects.
        </p>
      </div>

      {/* ---- Step 1: inputs + preview request ---- */}
      <form action={prepare} className="space-y-4">
        <input type="hidden" name="job_id" value={p.jobId} />
        <input type="hidden" name="attachments" value={attachMode === "files" ? fileUids.join(",") : ""} />

        {questions.length > 0 && (
          <fieldset className="space-y-3">
            <legend className="flex w-full items-center justify-between text-sm font-medium">
              Screening questions ({questions.length})
              <button
                type="button"
                disabled={busy || !s}
                onClick={() =>
                  startTransition(async () => {
                    setAnswersMsg(undefined);
                    const r = await draftAnswersAction(s!.id);
                    if (r.error) setAnswersMsg(r.error);
                    else setAnswers(questions.map((q, i) => r.answers?.find((a) => a.question === q)?.answer ?? r.answers?.[i]?.answer ?? ""));
                  })
                }
                className="text-xs font-normal text-emerald-700 hover:underline disabled:opacity-50 dark:text-emerald-400"
              >
                {busy ? "Drafting…" : "Draft answers with AI"}
              </button>
            </legend>
            {answersMsg && <p className="text-xs text-red-600">{answersMsg}</p>}
            {questions.map((q, i) => (
              <label key={i} className="block text-sm">
                <span className="mb-1 block text-zinc-700 dark:text-zinc-300">{q}</span>
                <input type="hidden" name="question" value={q} />
                <textarea
                  name="answer"
                  rows={3}
                  value={answers[i] ?? ""}
                  onChange={(e) => setAnswers((a) => a.map((v, j) => (j === i ? e.target.value : v)))}
                  className={inputClass}
                />
              </label>
            ))}
          </fieldset>
        )}

        <fieldset className="space-y-2 text-sm">
          <legend className="font-medium">Attach files? (Upwork asks every time)</legend>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2">
              <input type="radio" checked={attachMode === "none"} onChange={() => setAttachMode("none")} className="accent-emerald-600" />
              No files
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={attachMode === "files"} onChange={() => setAttachMode("files")} className="accent-emerald-600" />
              Attach files (CV, samples…)
            </label>
          </div>
          {attachMode === "files" && (
            <div className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
              {!upload ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await startUploadAction(p.jobTitle);
                      if (r.error || !r.taskId || !r.url) setUploadMsg(r.error ?? "No upload link.");
                      else {
                        setUpload({ taskId: r.taskId, url: r.url });
                        setUploadMsg("Open the upload page, add your files, then click Check upload. The link expires in a few minutes.");
                      }
                    })
                  }
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-700"
                >
                  Start a secure Upwork upload
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <a href={upload.url} target="_blank" rel="noopener noreferrer" className="font-medium text-emerald-700 underline dark:text-emerald-400">
                    Open upload page ↗
                  </a>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      startTransition(async () => {
                        const r = await checkUploadAction(upload.taskId);
                        if (r.error) setUploadMsg(r.error);
                        else {
                          setFileUids((prev) => [...new Set([...prev, ...(r.fileUids ?? [])])]);
                          setUploadMsg(`Upload status: ${r.status}. ${r.fileUids?.length ?? 0} file(s) found.`);
                        }
                      })
                    }
                    className="rounded-md border border-zinc-300 px-3 py-1.5 dark:border-zinc-700"
                  >
                    Check upload
                  </button>
                  <button type="button" onClick={() => setUpload(null)} className="text-zinc-500 hover:underline">
                    New upload
                  </button>
                </div>
              )}
              {uploadMsg && <p className="text-xs text-zinc-500">{uploadMsg}</p>}
              {fileUids.length > 0 && <p className="text-xs">Attached: {fileUids.length} file(s)</p>}
            </div>
          )}
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-3">
          {preview?.boost?.available && (
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Boost bid (Connects, optional)</span>
              <input
                name="boost_connects"
                type="number"
                min={preview.boost.minBoostConnects ?? 1}
                max={preview.boost.maxBoostConnects}
                value={boost}
                onChange={(e) => setBoost(e.target.value)}
                className={inputClass}
              />
            </label>
          )}
          {p.isFixed && (
            <>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">How long will it take?</span>
                <select name="estimated_duration" required value={duration} onChange={(e) => setDuration(e.target.value)} className={inputClass}>
                  <option value="" disabled>
                    Choose…
                  </option>
                  <option value="less_than_1_month">Less than 1 month</option>
                  <option value="1_to_3_months">1–3 months</option>
                  <option value="3_to_6_months">3–6 months</option>
                  <option value="more_than_6_months">More than 6 months</option>
                </select>
                {p.jobDuration && <span className="mt-1 block text-xs text-zinc-500">Client&apos;s estimate: {p.jobDuration}</span>}
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Payment</span>
                <select name="payment_mode" required value={mode} onChange={(e) => setMode(e.target.value)} className={inputClass}>
                  <option value="by_project">By project (whole amount on delivery)</option>
                </select>
                <span className="mt-1 block text-xs text-zinc-500">Milestones aren&apos;t supported here yet.</span>
              </label>
            </>
          )}
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Application method</span>
            <select name="application_method" value={method} onChange={(e) => setMethod(e.target.value)} className={inputClass}>
              <option value="">Only if Upwork asks</option>
              <option value="cover_letter">Cover letter</option>
              <option value="ai_interview">AI interview</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button disabled={preparing} className={submitClass}>
            {preparing ? "Asking Upwork…" : preview && s?.status === "previewed" ? "Update Upwork preview" : "Get Upwork preview"}
          </button>
          <FormMessage state={prepState} />
        </div>
        {prepState.kind === "connects" && (
          <p className="text-sm">
            <a href={BUY_CONNECTS} target="_blank" rel="noopener noreferrer" className="font-medium text-emerald-700 underline dark:text-emerald-400">
              Buy Connects on Upwork ↗
            </a>{" "}
            then get the preview again.
          </p>
        )}
      </form>

      {prepState.kind === "policy" && (
        <form action={ackPolicy} className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
          <p>Upwork needs you to acknowledge its policy (above) before applying. Read it first.</p>
          <button disabled={acking} className={submitClass}>
            {acking ? "Sending…" : "I have read and understand the policy"}
          </button>
          <FormMessage state={policyState} />
        </form>
      )}

      {s?.status === "failed" && s.error && (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          Last attempt was not submitted: {s.error}
        </p>
      )}

      {/* ---- Step 2: review + approve ---- */}
      {preview && s?.status === "previewed" && (
        <div className="space-y-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-semibold">Upwork preview</h3>
            {preview.expiresAt && (
              <span className="text-xs text-zinc-500">
                Valid until <LocalTime iso={preview.expiresAt} /> (about 15 minutes); after that, get a new preview.
              </span>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
            <Stat label="Connects to apply" value={preview.connectsCost} strong />
            <Stat label="Your balance" value={preview.connectsBalance} strong />
            <Stat label="Your bid" value={preview.chargedAmount !== undefined ? `$${preview.chargedAmount}` : undefined} strong />
            <Stat label="Can apply" value={preview.canApply === undefined ? undefined : preview.canApply ? "Yes" : "No"} />
            <Stat label="Plan" value={preview.plan} />
          </dl>
          {(preview.unmetQualifications.length > 0 || preview.additionalPreferences.length > 0) && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
              <p className="font-medium text-amber-800 dark:text-amber-300">
                The client prefers things your profile may not meet. Do you still want to apply?
              </p>
              <ul className="mt-1 list-disc pl-5">
                {[...preview.unmetQualifications, ...preview.additionalPreferences].map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
          )}

          {preview.previewText && (
            <div className="text-sm">
              <p className="mb-1 font-medium">What the client will receive (exactly as Upwork will send it)</p>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-zinc-200 bg-zinc-50 p-3 font-sans text-sm dark:border-zinc-800 dark:bg-zinc-900">
                {preview.previewText}
              </pre>
            </div>
          )}
          {preview.bidStatsAvailable === false && (
            <p className="text-xs text-zinc-500">What other applicants bid needs Freelancer Plus, so it isn&apos;t shown.</p>
          )}

          {preview.boost && (
            <div className="rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800">
              <p className="font-medium">Boost</p>
              {!preview.boost.available ? (
                <p className="text-zinc-500">Not available for this job{preview.boost.reason ? `: ${preview.boost.reason}` : ""}.</p>
              ) : (
                <>
                  <p className="text-zinc-600 dark:text-zinc-400">
                    Bids on this job now:{" "}
                    <strong>
                      {preview.boost.currentTopBidsAvailable === false
                        ? "unknown"
                        : preview.boost.currentTopBids?.length
                          ? preview.boost.currentTopBids.join(", ")
                          : "nobody has boosted"}
                    </strong>
                    {preview.boost.topSlots !== undefined && ` · ${preview.boost.topSlots} paid top slots`}
                    {preview.boost.recommendedConnects !== undefined && ` · Upwork recommends: ${preview.boost.recommendedConnects}`}
                    {` · allowed: ${preview.boost.minBoostConnects ?? 1}–${preview.boost.maxBoostConnects ?? "?"}`}
                  </p>
                  {(preview.boost.rationale ?? preview.boost.recommendation) && (
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">Upwork: {preview.boost.rationale ?? preview.boost.recommendation}</p>
                  )}
                  {preview.boost.suggestedBid?.median !== undefined && (
                    <p className="text-xs text-zinc-500">
                      For context only: on <em>similar</em> jobs last week, winning bids had a median of {preview.boost.suggestedBid.median}
                      {preview.boost.suggestedBid.p80 !== undefined && ` (80th percentile ${preview.boost.suggestedBid.p80})`} Connects.
                      These are not bids on this job.
                    </p>
                  )}
                  <p className="text-xs text-zinc-500">
                    A boost is an auction bid, not a fee: Upwork charges it only if you land a top slot or the client engages your
                    proposal before the auction closes. It can&apos;t be raised after submitting.
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span>Profit if you win this job ($):</span>
                    <input type="number" min={0} value={profit} onChange={(e) => setProfit(e.target.value)} className={`${inputClass} w-28`} />
                    <span className="text-zinc-500">win rate {p.winRatePercent}% (Settings)</span>
                  </div>
                  {advice ? (
                    <ul className={`mt-2 list-disc pl-5 text-xs ${advice.worthIt ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}>
                      <li className="font-medium">{advice.worthIt ? "Boost looks worth it" : "Boost probably isn't worth it"}</li>
                      {advice.reasons.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-zinc-500">Enter a boost bid above to see whether it pays (Get Seen on Upwork, ch. 3).</p>
                  )}
                </>
              )}
            </div>
          )}

          {preview.notes.length > 0 && (
            <ul className="list-disc pl-5 text-xs text-zinc-500">{preview.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
          )}
          <details>
            <summary className="cursor-pointer text-xs text-zinc-500">Full preview from Upwork</summary>
            <pre className="mt-2 max-h-80 overflow-auto rounded bg-zinc-50 p-3 font-mono text-xs dark:bg-zinc-900">{JSON.stringify(s.preview_raw, null, 2)}</pre>
          </details>

          <form
            action={confirmAction}
            onSubmit={(e) => {
              const total = cost + boostNum;
              if (!window.confirm(`Submit this proposal to Upwork now?\n\nThis spends ${total} Connects${boostNum ? ` (${cost} + ${boostNum} boost bid)` : ""}. It can't be undone.`)) {
                e.preventDefault();
              }
            }}
            className="space-y-3 rounded-md border-2 border-emerald-600/40 p-3"
          >
            <input type="hidden" name="submission_id" value={s.id} />
            <input type="hidden" name="org_uid" value={p.orgUid} />
            <input type="hidden" name="ack_attachments" value={attachMode ? "on" : ""} />
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="ack_connects" required className="mt-0.5 h-4 w-4 accent-emerald-600" />
              <span>
                I reviewed the letter and this preview. Submitting spends <strong>{cost + boostNum} Connects</strong>
                {boostNum ? ` (${cost} + ${boostNum} boost bid, charged only if it wins a paid slot)` : ""} from my balance of{" "}
                {preview.connectsBalance ?? "?"}.
              </span>
            </label>
            {dirty && <p className="text-xs text-amber-700 dark:text-amber-400">You changed something since this preview. Update the preview before approving.</p>}
            {!attachMode && <p className="text-xs text-amber-700 dark:text-amber-400">Choose whether to attach files.</p>}
            {unanswered > 0 && <p className="text-xs text-amber-700 dark:text-amber-400">{unanswered} screening question(s) unanswered.</p>}
            {limitError && <p className="text-xs text-red-600">{limitError}</p>}
            <div className="flex flex-wrap items-center gap-3">
              <button
                disabled={confirming || dirty || !attachMode || unanswered > 0 || !!limitError || preview.canApply === false}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                {confirming ? "Submitting…" : "Approve & submit to Upwork"}
              </button>
              <span className="text-xs text-zinc-500">
                Limits: {p.limits.maxPerProposal}/proposal · {p.limits.maxPerDay}/24h ({p.spent24h} used)
              </span>
            </div>
            <FormMessage state={confState} />
          </form>
        </div>
      )}
    </Box>
  );
}

function Box({ children }: { children: React.ReactNode }) {
  return <div className="mt-6 space-y-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">{children}</div>;
}

function Stat({ label, value, strong }: { label: string; value: unknown; strong?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className={strong ? "text-lg font-semibold" : "font-medium"}>{value === undefined || value === null ? "—" : String(value)}</dd>
    </div>
  );
}

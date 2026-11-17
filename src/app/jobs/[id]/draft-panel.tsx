"use client";

import { useActionState, useState } from "react";
import type { Draft } from "@/lib/feed/drafts";
import type { Highlight } from "@/lib/profile";
import { letterChecks, previewOf } from "@/lib/ai/letter-checks";
import { LocalTime } from "../../local-time";
import { generateDraftAction, refreshDetailsAction, saveDraftAction, type FormState } from "../../actions";
import { FormMessage, inputClass, submitClass } from "../../settings/fields";

const MAX = 5000;

type Props = {
  jobId: string;
  isHourly: boolean;
  aiReady: boolean;
  model: string;
  drafts: Draft[];
  highlights: { portfolio: Highlight[]; workHistory: Highlight[]; certificates: Highlight[] };
  detailsFetchedAt: string | null;
};

export function DraftPanel(props: Props) {
  const current = props.drafts[0];
  const [genState, generate, generating] = useActionState<FormState, FormData>(generateDraftAction, {});
  const [detState, refreshDetails, refreshing] = useActionState<FormState, FormData>(refreshDetailsAction, {});

  return (
    <div className="space-y-5 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Proposal</h2>
        <form action={refreshDetails} className="flex items-center gap-2 text-xs text-zinc-500">
          <input type="hidden" name="job_id" value={props.jobId} />
          <span>
            {props.detailsFetchedAt ? (
              <>
                Details loaded <LocalTime iso={props.detailsFetchedAt} />
              </>
            ) : (
              "No full details yet"
            )}
          </span>
          <button disabled={refreshing} className="underline-offset-2 hover:underline disabled:opacity-50">
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </form>
      </div>
      <FormMessage state={detState} />

      {!props.aiReady ? (
        <p className="text-sm text-amber-700">Add an OpenAI API key to write drafts (desktop app: menu → Set OpenAI API key; dev: OPENAI_API_KEY in .env.local).</p>
      ) : (
        <form action={generate} className="space-y-2">
          <input type="hidden" name="job_id" value={props.jobId} />
          {current && (
            <textarea
              name="instructions"
              rows={2}
              placeholder="Optional: how to change it, e.g. “shorter”, “mention my Stripe integration work”, “more formal”"
              className={inputClass}
            />
          )}
          <div className="flex items-center gap-3">
            <button disabled={generating} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
              {generating ? `Writing with ${props.model}…` : current ? "Regenerate with AI" : "Write draft with AI"}
            </button>
            <FormMessage state={genState} />
          </div>
        </form>
      )}

      {current ? (
        <DraftEditor key={current.id} {...props} draft={current} />
      ) : (
        <p className="text-sm text-zinc-500">No draft yet.</p>
      )}

      {props.drafts.length > 1 && (
        <details>
          <summary className="cursor-pointer text-sm text-zinc-500">Earlier versions ({props.drafts.length - 1})</summary>
          <ul className="mt-2 space-y-3">
            {props.drafts.slice(1).map((d) => (
              <li key={d.id} className="rounded border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                <p className="mb-1 text-xs text-zinc-500">
                  v{d.version} · {d.source === "ai" ? `AI (${d.model})` : "your edit"} · <LocalTime iso={d.created_at} />
                  {d.instructions && ` · “${d.instructions}”`}
                </p>
                <p className="whitespace-pre-line text-zinc-700 dark:text-zinc-300">{d.cover_letter}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function DraftEditor({ draft, isHourly, jobId, highlights }: Props & { draft: Draft }) {
  const [letter, setLetter] = useState(draft.cover_letter);
  const [copied, setCopied] = useState(false);
  const [saveState, save, saving] = useActionState<FormState, FormData>(saveDraftAction, {});
  const over = letter.length > MAX;

  const groups: [string, string, Highlight[], string[]][] = [
    ["Past Upwork contracts", "work_history_ids", highlights.workHistory, draft.highlights.work_history_ids],
    ["Portfolio projects", "portfolio_project_ids", highlights.portfolio, draft.highlights.portfolio_project_ids],
    ["Certificates", "certificate_ids", highlights.certificates, draft.highlights.certificate_ids],
  ];

  return (
    <form action={save} className="space-y-4">
      <input type="hidden" name="job_id" value={jobId} />
      <p className="text-xs text-zinc-500">
        Current: v{draft.version} · {draft.source === "ai" ? `AI (${draft.model})` : "your edit"} ·{" "}
        <LocalTime iso={draft.created_at} />
      </p>

      {draft.notes.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="mb-1 font-medium">Check before sending</p>
          <ul className="list-disc space-y-0.5 pl-5">
            {draft.notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </div>
      )}

      <label className="block">
        <span className="mb-1 flex items-center justify-between text-sm font-medium">
          Cover letter
          <span className={`text-xs font-normal ${over ? "text-red-600" : "text-zinc-500"}`}>
            {letter.length} / {MAX}
          </span>
        </span>
        <textarea
          name="cover_letter"
          value={letter}
          onChange={(e) => setLetter(e.target.value)}
          rows={16}
          className={`${inputClass} leading-relaxed`}
        />
      </label>

      <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <p className="mb-1 text-xs font-medium text-zinc-500">What the client sees in their list before clicking</p>
        <p className="text-zinc-800 dark:text-zinc-200">{previewOf(letter) || "—"}</p>
        <ul className="mt-2 space-y-0.5 text-xs">
          {letterChecks(letter).map((c) => (
            <li key={c.label} className={c.ok ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}>
              {c.ok ? "✓" : "✗"} {c.label}
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">{isHourly ? "Hourly rate ($/hr)" : "Fixed price ($)"}</span>
          <input name="bid_amount" type="number" min={1} step="any" defaultValue={draft.bid_amount ?? ""} className={inputClass} />
        </label>
        {draft.bid_rationale && <p className="self-end pb-2 text-xs text-zinc-500">{draft.bid_rationale}</p>}
      </div>

      {groups.some(([, , items]) => items.length > 0) && (
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Attach highlights</legend>
          <div className="space-y-2">
            {groups.map(([label, name, items, picked]) =>
              items.length === 0 ? null : (
                <div key={name}>
                  <p className="text-xs text-zinc-500">{label}</p>
                  {items.map((h) => (
                    <label key={h.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name={name} value={h.id} defaultChecked={picked.includes(h.id)} className="h-4 w-4 accent-emerald-600" />
                      {h.title}
                      {h.score !== undefined && <span className="text-xs text-zinc-500">★ {h.score}</span>}
                    </label>
                  ))}
                </div>
              ),
            )}
          </div>
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button disabled={saving || over} className={submitClass}>
          {saving ? "Saving…" : "Save edits"}
        </button>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(letter);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {copied ? "Copied" : "Copy letter"}
        </button>
        <FormMessage state={saveState} />
      </div>
    </form>
  );
}

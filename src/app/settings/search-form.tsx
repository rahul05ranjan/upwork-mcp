"use client";

import { useActionState, useState } from "react";
import { createSearchAction, type FormState } from "../actions";
import { Check, Field, FormMessage, inputClass, submitClass } from "./fields";

export function SearchForm() {
  const [kind, setKind] = useState<"search" | "smart">("search");
  const [state, action, pending] = useActionState<FormState, FormData>(createSearchAction, {});

  return (
    <form action={action} className="space-y-4 rounded-lg border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
      <h3 className="font-medium">Add a saved search</h3>

      <div className="flex flex-wrap gap-4 text-sm">
        {(
          [
            ["search", "Search by skills / keywords"],
            ["smart", "Upwork's recommendations for my profile"],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex items-center gap-2">
            <input
              type="radio"
              name="kind"
              value={value}
              checked={kind === value}
              onChange={() => setKind(value)}
              className="accent-emerald-600"
            />
            {label}
          </label>
        ))}
      </div>

      <Field label="Name">
        <input name="name" required placeholder={kind === "smart" ? "Recommended today" : "React jobs"} className={inputClass} />
      </Field>

      {kind === "smart" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Feed">
            <select name="mode" defaultValue="most_recent" className={inputClass}>
              <option value="most_recent">Most recent (newest first)</option>
              <option value="best_match">Best matches (ranked by fit)</option>
            </select>
          </Field>
          <Field label="Posted within (days)" hint="Most recent feed only. Leave empty for no limit.">
            <input name="days_posted" type="number" min={1} defaultValue={1} className={inputClass} />
          </Field>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Title words" hint="1–3 words that must be in the job title, e.g. “react developer”.">
              <input name="title" className={inputClass} />
            </Field>
            <Field label="…or keywords" hint="Matches the whole posting, broader. Not with title words.">
              <input name="query" className={inputClass} />
            </Field>
            <Field label="Skills" hint="Up to 5 Upwork skill names, comma-separated. Jobs must have all.">
              <input name="skills" placeholder="React, Next.js" className={inputClass} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Job type">
              <select name="job_type" defaultValue="" className={inputClass}>
                <option value="">Any</option>
                <option value="hourly">Hourly</option>
                <option value="fixed">Fixed price</option>
              </select>
            </Field>
            <Field label="Experience level">
              <select name="experience_level" defaultValue="" className={inputClass}>
                <option value="">Any</option>
                <option value="entry_level">Entry</option>
                <option value="intermediate">Intermediate</option>
                <option value="expert">Expert</option>
              </select>
            </Field>
            <Field label="Min hourly rate ($)">
              <input name="rate_min" type="number" min={1} step="any" className={inputClass} />
            </Field>
            <Field label="Min fixed budget ($)">
              <input name="budget_min" type="number" min={1} step="any" className={inputClass} />
            </Field>
            <Field label="Max proposals so far" hint="e.g. 10 = fewer than 10">
              <input name="proposals_max" type="number" min={0} className={inputClass} />
            </Field>
            <Field label="Client min hires">
              <input name="client_hires_min" type="number" min={0} className={inputClass} />
            </Field>
            <Field label="Client location" hint="Country or region, e.g. United States, Europe">
              <input name="location" className={inputClass} />
            </Field>
            <div className="flex items-end pb-2">
              <Check name="verified_payment_only" label="Verified payment only" defaultChecked />
            </div>
          </div>
        </>
      )}

      <div className="flex items-center gap-3">
        <button disabled={pending} className={submitClass}>
          {pending ? "Saving…" : "Save search"}
        </button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

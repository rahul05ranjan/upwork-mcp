"use client";

import { useActionState } from "react";
import { PROPOSAL_TIERS } from "@/lib/feed/parse";
import type { Account } from "@/lib/feed/run";
import type { Settings } from "@/lib/feed/settings";
import { saveSettingsAction, type FormState } from "../actions";
import { Check, Field, FormMessage, inputClass, submitClass } from "./fields";

export function SettingsForm({ settings, accounts }: { settings: Settings; accounts: Account[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveSettingsAction, {});
  const r = settings.rules;

  return (
    <form action={action} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Upwork account"
          hint={accounts.length ? "Searches and later proposals use this account." : "Connect Upwork to choose."}
        >
          <select name="org_uid" defaultValue={settings.orgUid ?? ""} className={inputClass} disabled={!accounts.length}>
            {!settings.orgUid && <option value="">Freelancer account (default)</option>}
            {accounts.map((a) => (
              <option key={a.org_uid} value={a.org_uid}>
                {a.name} ({a.role_label})
              </option>
            ))}
          </select>
          {accounts.map((a) => (
            <input key={a.org_uid} type="hidden" name={`org_label_${a.org_uid}`} value={`${a.name} (${a.role_label})`} />
          ))}
        </Field>
        <Field label="Run every (minutes)" hint="0 turns automatic runs off. Minimum 10.">
          <input name="interval_minutes" type="number" min={0} defaultValue={settings.intervalMinutes} className={inputClass} />
        </Field>
        <Field label="Pages per search" hint="10 jobs per page, 1–5.">
          <input name="pages_per_search" type="number" min={1} max={5} defaultValue={settings.pagesPerSearch} className={inputClass} />
        </Field>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold">Connects limits (Approve is refused above these)</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Max Connects per proposal" hint="Proposal cost + boost.">
            <input name="max_connects_per_proposal" type="number" min={1} defaultValue={settings.maxConnectsPerProposal} className={inputClass} />
          </Field>
          <Field label="Max Connects per 24 hours">
            <input name="max_connects_per_day" type="number" min={1} defaultValue={settings.maxConnectsPerDay} className={inputClass} />
          </Field>
          <Field label="Your win rate (%)" hint="Rough share of proposals that become hires; used by the boost calculator.">
            <input name="win_rate_percent" type="number" min={0.1} max={100} step="0.1" defaultValue={settings.winRatePercent} className={inputClass} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-2 text-sm font-semibold">Filter rules</legend>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Min hourly rate ($)" hint="Hides hourly jobs whose top rate is lower.">
            <input name="min_hourly_rate" type="number" min={1} step="any" defaultValue={r.minHourlyRate} className={inputClass} />
          </Field>
          <Field label="Min fixed budget ($)">
            <input name="min_fixed_budget" type="number" min={1} step="any" defaultValue={r.minFixedBudget} className={inputClass} />
          </Field>
          <Field label="Min client spend ($)">
            <input name="min_client_spend" type="number" min={1} step="any" defaultValue={r.minClientSpend} className={inputClass} />
          </Field>
          <Field label="Min client rating" hint="Out of 5; clients with no reviews pass.">
            <input name="min_client_rating" type="number" min={0} max={5} step="0.1" defaultValue={r.minClientRating} className={inputClass} />
          </Field>
        </div>

        <div className="flex flex-wrap gap-6">
          <Check name="require_verified_payment" label="Client payment must be verified" defaultChecked={r.requireVerifiedPayment} />
          <Check name="skip_if_hired" label="Hide jobs where someone was already hired" defaultChecked={r.skipIfHired} />
        </div>

        <div>
          <p className="mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">Hide jobs with this many proposals</p>
          <div className="flex flex-wrap gap-4">
            {PROPOSAL_TIERS.map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="exclude_tiers"
                  value={t}
                  defaultChecked={r.excludeProposalTiers.includes(t)}
                  className="h-4 w-4 accent-emerald-600"
                />
                {t}
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Exclude keywords" hint="Comma or line separated; matched in title and description.">
            <textarea name="exclude_keywords" rows={2} defaultValue={r.excludeKeywords.join(", ")} className={inputClass} />
          </Field>
          <Field label="Exclude client countries" hint="Comma or line separated.">
            <textarea name="exclude_countries" rows={2} defaultValue={r.excludeCountries.join(", ")} className={inputClass} />
          </Field>
        </div>
      </fieldset>

      <div className="flex items-center gap-3">
        <button disabled={pending} className={submitClass}>
          {pending ? "Saving…" : "Save settings"}
        </button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

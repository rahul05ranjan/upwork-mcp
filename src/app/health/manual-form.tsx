"use client";

import { useActionState } from "react";
import type { ManualHealth } from "@/lib/health";
import { saveHealthManualAction, type FormState } from "../actions";
import { FormMessage, inputClass, submitClass } from "../settings/fields";

const FIELDS: [keyof ManualHealth, string][] = [
  ["complete100", "Upwork's profile completeness meter shows 100%"],
  ["hireAgain90", "Hire-again rate on my profile is 90% or more"],
  ["responseTimeShown", "An average response time shows on my profile"],
  ["activeContract", "I have an active contract right now"],
];

const toValue = (v: boolean | undefined) => (v === true ? "yes" : v === false ? "no" : "");

export function ManualHealthForm({ manual }: { manual: ManualHealth }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveHealthManualAction, {});
  return (
    <form action={action} className="space-y-3">
      {FIELDS.map(([key, label]) => (
        <label key={key} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>{label}</span>
          <select name={key} defaultValue={toValue(manual[key])} className={`${inputClass} w-40`}>
            <option value="">Not checked</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
      ))}
      <div className="flex items-center gap-3">
        <button disabled={pending} className={submitClass}>
          {pending ? "Saving…" : "Save"}
        </button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

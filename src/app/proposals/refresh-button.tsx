"use client";

import { useActionState } from "react";
import { refreshOutcomesAction, type FormState } from "../actions";
import { FormMessage, submitClass } from "../settings/fields";

export function RefreshOutcomesButton() {
  const [state, action, pending] = useActionState<FormState, FormData>(refreshOutcomesAction, {});
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <button disabled={pending} className={submitClass}>
        {pending ? "Checking Upwork…" : "Refresh from Upwork"}
      </button>
      <FormMessage state={state} />
    </form>
  );
}

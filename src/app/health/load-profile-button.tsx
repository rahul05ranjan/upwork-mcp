"use client";

import { useActionState } from "react";
import { refreshProfileAction, type FormState } from "../actions";
import { FormMessage, submitClass } from "../settings/fields";

export function LoadProfileButton() {
  const [state, action, pending] = useActionState<FormState, FormData>(refreshProfileAction, {});
  return (
    <form action={action} className="flex items-center gap-3">
      <button disabled={pending} className={submitClass}>
        {pending ? "Loading from Upwork…" : "Load my profile"}
      </button>
      <FormMessage state={state} />
    </form>
  );
}

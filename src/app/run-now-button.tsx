"use client";

import { useState, useTransition } from "react";
import { runNowAction } from "./actions";

export function RunNowButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string>();

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={() =>
          startTransition(async () => {
            const s = await runNowAction();
            setResult(`${s.found} found, ${s.newJobs} new${s.messages.length ? ` · ${s.messages.length} note(s)` : ""}`);
          })
        }
        disabled={pending}
        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {pending ? "Searching Upwork…" : "Run searches now"}
      </button>
      {result && !pending && <span className="text-xs text-zinc-500">{result}</span>}
    </div>
  );
}

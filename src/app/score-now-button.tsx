"use client";

import { useState, useTransition } from "react";
import { scoreNowAction } from "./actions";

export function ScoreNowButton({ count }: { count: number }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string>();

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={() => startTransition(async () => setResult(await scoreNowAction()))}
        disabled={pending}
        className="rounded-md border border-emerald-600 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-60 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
      >
        {pending ? "Scoring…" : `AI score ${count} job${count === 1 ? "" : "s"}`}
      </button>
      {result && !pending && <span className="max-w-xs text-right text-xs text-zinc-500">{result}</span>}
    </div>
  );
}

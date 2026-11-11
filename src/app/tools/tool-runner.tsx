"use client";

import { useState } from "react";

export function ToolRunner({ name }: { name: string }) {
  const [args, setArgs] = useState("{}");
  const [output, setOutput] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function run() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(args);
    } catch {
      setOutput("Arguments must be valid JSON.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/upwork/tools/call", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, args: parsed }),
      });
      setOutput(JSON.stringify(await res.json(), null, 2));
    } catch (err) {
      setOutput(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs text-zinc-500">Try it</summary>
      <div className="mt-2 space-y-2">
        <textarea
          value={args}
          onChange={(e) => setArgs(e.target.value)}
          rows={4}
          spellCheck={false}
          aria-label={`Arguments for ${name}`}
          className="w-full rounded border border-zinc-300 bg-transparent p-2 font-mono text-xs dark:border-zinc-700"
        />
        <button
          onClick={run}
          disabled={busy}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {busy ? "Running…" : "Run"}
        </button>
        {output && (
          <pre className="max-h-96 overflow-auto rounded bg-zinc-50 p-3 font-mono text-xs dark:bg-zinc-900">{output}</pre>
        )}
      </div>
    </details>
  );
}

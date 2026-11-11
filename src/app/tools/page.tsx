import { Suspense } from "react";
import { connection } from "next/server";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { hasTokens } from "@/lib/upwork/auth-provider";
import { isReadOnlyTool, listAllTools, NeedsLogin, withUpwork } from "@/lib/upwork/client";
import { errorMessage } from "@/lib/http";
import { ToolRunner } from "./tool-runner";

export default function ToolsPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Upwork tools</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Everything Upwork&apos;s MCP server offers. Read-only tools can be tried here; tools that change things on Upwork are
        listed but blocked.
      </p>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading tools…</p>}>
        <ToolList />
      </Suspense>
    </main>
  );
}

async function ToolList() {
  await connection();
  if (!(await hasTokens())) return <p className="text-sm text-zinc-500">Connect Upwork to see its tools.</p>;

  let tools: Tool[];
  try {
    tools = await withUpwork(listAllTools);
  } catch (err) {
    return (
      <p className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
        {err instanceof NeedsLogin ? "Upwork session expired. Click Connect Upwork at the top." : `Listing tools failed: ${errorMessage(err)}`}
      </p>
    );
  }

  const sorted = [...tools].sort((a, b) => Number(isReadOnlyTool(b)) - Number(isReadOnlyTool(a)));
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">Available tools ({tools.length})</h2>
      <ul className="space-y-3">
        {sorted.map((tool) => {
          const readOnly = isReadOnlyTool(tool);
          return (
            <li key={tool.name} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <div className="flex flex-wrap items-center gap-2">
                <code className="font-mono text-sm font-semibold">{tool.name}</code>
                <span
                  className={`rounded px-1.5 py-0.5 text-xs ${
                    readOnly
                      ? "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300"
                      : "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300"
                  }`}
                >
                  {readOnly ? "read-only" : "writes to Upwork"}
                </span>
              </div>
              {tool.description && (
                <p className="mt-1 whitespace-pre-line text-sm text-zinc-600 dark:text-zinc-400">{tool.description}</p>
              )}
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-zinc-500">Input schema</summary>
                <pre className="mt-2 overflow-x-auto rounded bg-zinc-50 p-3 font-mono text-xs dark:bg-zinc-900">
                  {JSON.stringify(tool.inputSchema, null, 2)}
                </pre>
              </details>
              {readOnly && <ToolRunner name={tool.name} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

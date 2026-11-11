import { Suspense } from "react";
import { connection } from "next/server";
import { hasTokens } from "@/lib/upwork/auth-provider";
import { withUpwork } from "@/lib/upwork/client";
import { fetchAccounts, type Account } from "@/lib/feed/run";
import { describeParams, listSearches } from "@/lib/feed/searches";
import { getSettings } from "@/lib/feed/settings";
import { deleteSearchAction, toggleSearchAction } from "../actions";
import { SearchForm } from "./search-form";
import { SettingsForm } from "./settings-form";
import { WriterForm, type ProfileSummary } from "./writer-form";
import { DRAFT_MODEL, hasOpenAI, SCORING_MODEL } from "@/lib/ai/openai";
import { tokenUsage } from "@/lib/feed/drafts";
import { getProfileContext, getWriterNotes } from "@/lib/profile";

function profileSummary(): ProfileSummary | null {
  const ctx = getProfileContext();
  if (!ctx) return null;
  return {
    fetchedAt: ctx.fetchedAt,
    title: ctx.title,
    rate: ctx.hourlyRate,
    skills: ctx.skills,
    portfolio: ctx.portfolio.length,
    workHistory: ctx.workHistory.length,
    certificates: ctx.certificates.length,
    pastProposals: ctx.pastProposals.length,
  };
}

export default function SettingsPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Searches &amp; rules</h1>
      <p className="mb-8 text-sm text-zinc-500">
        Saved searches run on Upwork. Rules then filter the results here; filtered jobs stay visible under
        &ldquo;Filtered out&rdquo; with the reason.
      </p>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <SettingsContent />
      </Suspense>
    </main>
  );
}

async function loadAccounts(): Promise<Account[]> {
  if (!(await hasTokens())) return [];
  try {
    return await withUpwork(fetchAccounts);
  } catch {
    return [];
  }
}

async function SettingsContent() {
  await connection();
  const settings = getSettings();
  const searches = listSearches();
  const accounts = await loadAccounts();

  return (
    <div className="grid gap-10">
      <section>
        <h2 className="mb-3 text-lg font-semibold">Saved searches</h2>
        {searches.length === 0 ? (
          <p className="mb-4 text-sm text-zinc-500">None yet. Add one below.</p>
        ) : (
          <ul className="mb-6 divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {searches.map((s) => (
              <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {s.name}{" "}
                    <span className="ml-1 rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-normal text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {s.kind === "smart" ? "Upwork recommendations" : "Search"}
                    </span>
                    {!s.enabled && <span className="ml-2 text-xs font-normal text-zinc-400">paused</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">{describeParams(s.kind, s.params)}</p>
                  {s.lastRunAt && (
                    <p
                      className={`mt-1 text-xs ${
                        s.lastStatus === "error"
                          ? "text-red-700 dark:text-red-400"
                          : s.lastStatus === "warning"
                            ? "text-amber-700 dark:text-amber-400"
                            : "text-zinc-400"
                      }`}
                    >
                      Last run: {s.lastMessage}
                    </p>
                  )}
                </div>
                <div className="flex gap-1.5">
                  <form action={toggleSearchAction}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="enabled" value={s.enabled ? "0" : "1"} />
                    <button className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
                      {s.enabled ? "Pause" : "Resume"}
                    </button>
                  </form>
                  <form action={deleteSearchAction}>
                    <input type="hidden" name="id" value={s.id} />
                    <button className="rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40">
                      Delete
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
        <SearchForm />
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold">AI writer</h2>
        <p className="mb-4 text-sm text-zinc-500">
          Scores and drafts use your Upwork profile plus these notes. Drafts never claim anything that isn&apos;t here or on your
          profile, so add real facts that are missing. Models: scoring <code className="font-mono">{SCORING_MODEL}</code>, drafting{" "}
          <code className="font-mono">{DRAFT_MODEL}</code> (change in .env.local).
        </p>
        {!hasOpenAI() && <p className="mb-4 text-sm text-amber-700">OPENAI_API_KEY is not set; AI features are off.</p>}
        <WriterForm notes={getWriterNotes()} profile={profileSummary()} usage={tokenUsage()} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Account, schedule &amp; rules</h2>
        <SettingsForm settings={settings} accounts={accounts} />
      </section>
    </div>
  );
}

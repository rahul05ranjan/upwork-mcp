import { Suspense } from "react";
import { connection } from "next/server";
import { hasTokens } from "@/lib/upwork/auth-provider";
import { withUpwork } from "@/lib/upwork/client";
import { accountLabel, activeProfile, fetchAccounts, type Account } from "@/lib/session";
import { describeParams, listSearches } from "@/lib/feed/searches";
import { getSettings } from "@/lib/feed/settings";
import { deleteSearchAction, switchAccountAction, toggleSearchAction } from "../actions";
import { inputClass } from "./fields";
import { SearchForm } from "./search-form";
import { SettingsForm } from "./settings-form";
import { WriterForm, type ProfileSummary } from "./writer-form";
import { DRAFT_MODEL, hasOpenAI, SCORING_MODEL } from "@/lib/ai/openai";
import { tokenUsage } from "@/lib/feed/drafts";
import { getProfileContext, getWriterNotes } from "@/lib/profile";
import { Gated } from "../profile-gate";

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
    <Gated>
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
    </Gated>
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

const smallButton =
  "rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800";

/** Other orgs on the same Upwork login (e.g. an agency). Each has its own searches, jobs and settings. */
async function AccountSwitcher() {
  const active = activeProfile();
  const accounts = await loadAccounts();
  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold">Upwork profile</h2>
      <p className="mb-3 text-sm text-zinc-500">
        Everything on these pages belongs to <strong className="text-zinc-700 dark:text-zinc-300">{active?.label}</strong>: its
        searches, jobs, drafts, proposals and settings. Another profile keeps its own.
      </p>
      {accounts.length > 1 && (
        <form action={switchAccountAction} className="flex flex-wrap items-center gap-2">
          <select name="org_uid" defaultValue={active?.orgUid} className={`${inputClass} max-w-xs`}>
            {accounts.map((a) => (
              <option key={a.org_uid} value={a.org_uid}>
                {accountLabel(a)}
              </option>
            ))}
          </select>
          <button className={smallButton}>Switch profile</button>
        </form>
      )}
    </section>
  );
}

async function SettingsContent() {
  await connection();
  const settings = getSettings();
  const searches = listSearches();

  return (
    <div className="grid gap-10">
      <AccountSwitcher />

      <section>
        <h2 className="mb-1 text-lg font-semibold">Saved searches</h2>
        <p className="mb-3 text-sm text-zinc-500">
          The first run set these up from your profile&apos;s skills. Add more below, or delete the ones you don&apos;t want; they
          won&apos;t come back.
        </p>
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
        <h2 className="mb-3 text-lg font-semibold">Schedule &amp; rules</h2>
        <SettingsForm settings={settings} />
      </section>
    </div>
  );
}

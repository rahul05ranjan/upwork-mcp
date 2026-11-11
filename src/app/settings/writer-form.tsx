"use client";

import { useActionState } from "react";
import type { WriterNotes } from "@/lib/profile";
import { refreshProfileAction, saveWriterNotesAction, type FormState } from "../actions";
import { Field, FormMessage, inputClass, submitClass } from "./fields";
import { LocalTime } from "../local-time";

export type ProfileSummary = {
  fetchedAt: string;
  title?: string;
  rate?: number;
  skills: string[];
  portfolio: number;
  workHistory: number;
  certificates: number;
  pastProposals: number;
};

type Usage = { model: string; input: number; output: number; calls: number }[];

// Fixed locale so server and browser render the same text.
const fmt = new Intl.NumberFormat("en-US");

export function WriterForm({ notes, profile, usage }: { notes: WriterNotes; profile: ProfileSummary | null; usage: Usage }) {
  const [saveState, save, saving] = useActionState<FormState, FormData>(saveWriterNotesAction, {});
  const [loadState, load, loading] = useActionState<FormState, FormData>(refreshProfileAction, {});

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">From your Upwork profile</p>
          <form action={load}>
            <button disabled={loading} className="text-xs text-emerald-700 underline-offset-2 hover:underline disabled:opacity-50 dark:text-emerald-400">
              {loading ? "Loading…" : profile ? "Reload from Upwork" : "Load from Upwork"}
            </button>
          </form>
        </div>
        {profile ? (
          <div className="mt-2 space-y-1 text-zinc-600 dark:text-zinc-400">
            <p>
              {profile.title ?? "No title"}
              {profile.rate ? ` · $${profile.rate}/hr` : ""}
            </p>
            <p>Skills: {profile.skills.join(", ") || "—"}</p>
            <p>
              {profile.workHistory} past contracts · {profile.portfolio} portfolio projects · {profile.certificates} certificates ·{" "}
              {profile.pastProposals} past proposals
            </p>
            <p className="text-xs text-zinc-400">
              Loaded <LocalTime iso={profile.fetchedAt} /> · refreshes daily
            </p>
          </div>
        ) : (
          <p className="mt-2 text-zinc-500">Not loaded yet. It loads automatically on the first AI run.</p>
        )}
        <div className="mt-2">
          <FormMessage state={loadState} />
        </div>
      </div>

      <form action={save} className="space-y-4">
        <Field label="About me (facts not on my profile)" hint="Real projects, results, tools, industries. Drafts may only claim what's here or on your profile.">
          <textarea name="about" rows={5} defaultValue={notes.about} className={inputClass} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Writing style" hint="e.g. friendly and direct, short paragraphs, no buzzwords.">
            <textarea name="style" rows={3} defaultValue={notes.style} className={inputClass} />
          </Field>
          <Field label="Sign-off" hint="e.g. “Best, Rahul”">
            <input name="sign_off" defaultValue={notes.signOff} className={inputClass} />
          </Field>
        </div>
        <Field label="Sample proposals that won work" hint="Paste 1–3. Used for tone and structure only, never for facts.">
          <textarea name="samples" rows={6} defaultValue={notes.samples} className={inputClass} />
        </Field>
        <div className="flex items-center gap-3">
          <button disabled={saving} className={submitClass}>
            {saving ? "Saving…" : "Save writer notes"}
          </button>
          <FormMessage state={saveState} />
        </div>
      </form>

      {usage.length > 0 && (
        <p className="text-xs text-zinc-500">
          OpenAI usage so far:{" "}
          {usage.map((u) => `${u.model}: ${u.calls} calls, ${fmt.format(u.input)} in / ${fmt.format(u.output)} out tokens`).join(" · ")}
        </p>
      )}
    </div>
  );
}

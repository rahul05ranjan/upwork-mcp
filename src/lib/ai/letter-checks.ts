// Checks on a cover letter based on what buyers see (Get Seen on Upwork 2026,
// ch. 8). Pure functions: used by the server after drafting and live in the editor.

/** Roughly what a buyer sees in the proposal list before clicking. */
export const PREVIEW_CHARS = 230;

export function previewOf(letter: string): string {
  const flat = letter.replace(/\s+/g, " ").trim();
  return flat.length > PREVIEW_CHARS ? `${flat.slice(0, PREVIEW_CHARS).trimEnd()}…` : flat;
}

export function wordCount(letter: string): number {
  return letter.trim() ? letter.trim().split(/\s+/).length : 0;
}

const GREETING = /^\s*(hi|hello|hey|dear|greetings|good (morning|afternoon|evening)|hope you|i am|i'm|my name)\b/i;

export type LetterCheck = { ok: boolean; label: string };

export function letterChecks(letter: string): LetterCheck[] {
  const words = wordCount(letter);
  const firstLine = letter.trim().split(/\n/)[0] ?? "";
  // The closing question usually sits just before the sign-off.
  const body = letter.trim().split(/\n\s*\n/);
  const tail = body.slice(-2).join("\n");
  return [
    {
      ok: !GREETING.test(firstLine),
      label: "Opens with the job, not a greeting or “I am” (the first ~230 characters are the preview)",
    },
    { ok: words >= 40 && words <= 250, label: `Length ${words} words (top earners on page one: about 170)` },
    { ok: /\?/.test(tail), label: "Ends with one real question about the client's job" },
  ];
}

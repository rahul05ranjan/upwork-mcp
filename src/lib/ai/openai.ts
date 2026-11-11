import "server-only";
import OpenAI from "openai";

// Models are configurable in .env.local; defaults are ones this key can use.
export const SCORING_MODEL = process.env.OPENAI_SCORING_MODEL ?? "gpt-5.4-mini";
export const DRAFT_MODEL = process.env.OPENAI_DRAFT_MODEL ?? "gpt-5.5";

export function hasOpenAI(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

const g = globalThis as unknown as { __openai?: OpenAI };
export function openai(): OpenAI {
  if (!hasOpenAI()) throw new Error("OPENAI_API_KEY is not set in .env.local");
  return (g.__openai ??= new OpenAI());
}

/** Reasoning settings, only for models that accept them (gpt-5.x, gpt-6.x, o-series). */
export function reasoningFor(model: string, effort: "low" | "medium" | "high") {
  return /^(gpt-[5-9]|o\d)/.test(model) ? { reasoning: { effort } } : {};
}

/**
 * Wraps text written by an Upwork client so the model reads it as data.
 * Upwork already marks it untrusted; we keep that and close any tag the text
 * itself tries to close early.
 */
export function untrusted(label: string, text: string): string {
  const tags = ["untrusted_participant_content", "job_post", "client_reviews", "screening_questions", label].join("|");
  const safe = text.replace(new RegExp(`</?(${tags})[^>]*>`, "gi"), "");
  return `<${label}>\n${safe}\n</${label}>`;
}

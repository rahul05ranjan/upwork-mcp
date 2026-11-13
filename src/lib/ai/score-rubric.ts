// The fit-score rubric. The model scores each factor; the total and verdict
// are computed here, so the same factor points always give the same score and
// the card can show where points were lost. Pure; unit-tested.

export const FACTORS = [
  { key: "skills", label: "Skills", max: 40, guide: "Skill and domain match with the freelancer's real profile. Missing required skills cost the most." },
  { key: "pay", label: "Pay", max: 20, guide: "Budget or hourly rate against the freelancer's own rate and the size of the work." },
  { key: "client", label: "Client", max: 20, guide: "Verified payment, money spent, rating from other freelancers, hire history." },
  { key: "competition", label: "Competition", max: 10, guide: "Fewer proposals and nobody hired or interviewing yet score higher." },
  { key: "clarity", label: "Clarity", max: 10, guide: "Clear deliverables and scope; vague or truncated posts score lower." },
] as const;

export type FactorKey = (typeof FACTORS)[number]["key"];
export type Breakdown = Record<FactorKey, { points: number; note: string }>;
export type Verdict = "strong" | "maybe" | "weak";

/** Clamps each factor to its range and adds them up (0–100). */
export function totalScore(b: Breakdown): number {
  return FACTORS.reduce((sum, f) => sum + clamp(b[f.key]?.points ?? 0, f.max), 0);
}

export function verdictFor(total: number): Verdict {
  return total >= 80 ? "strong" : total >= 50 ? "maybe" : "weak";
}

/** The model's points, clamped, so a stray 45/40 can't inflate the total. */
export function normalizeBreakdown(b: Breakdown): Breakdown {
  return Object.fromEntries(
    FACTORS.map((f) => [f.key, { points: clamp(b[f.key]?.points ?? 0, f.max), note: b[f.key]?.note ?? "" }]),
  ) as Breakdown;
}

function clamp(n: number, max: number): number {
  return Number.isFinite(n) ? Math.min(max, Math.max(0, Math.round(n))) : 0;
}

/** The rubric as text for the model's instructions. */
export function rubricText(): string {
  return FACTORS.map((f) => `- ${f.key} (0–${f.max}): ${f.guide}`).join("\n");
}

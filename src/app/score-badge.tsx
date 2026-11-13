import { FACTORS, type Breakdown } from "@/lib/ai/score-rubric";

const STYLES = {
  strong: "bg-emerald-100 text-emerald-800 ring-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:ring-emerald-800",
  maybe: "bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:ring-amber-800",
  weak: "bg-zinc-100 text-zinc-600 ring-zinc-300 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-700",
};

export function ScoreBadge({ score, verdict }: { score: number; verdict: keyof typeof STYLES }) {
  return (
    <span
      title={`AI fit score: ${verdict}`}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ring-1 ${STYLES[verdict]}`}
    >
      {score}
    </span>
  );
}

/** Where the score's points came from. `detailed` adds the model's reason for each factor. */
export function ScoreBreakdown({ breakdown, detailed }: { breakdown: Breakdown; detailed?: boolean }) {
  if (!detailed) {
    return (
      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-500">
        {FACTORS.map((f) => (
          <span key={f.key} title={breakdown[f.key].note}>
            {f.label}{" "}
            <span className={pointsClass(breakdown[f.key].points, f.max)}>
              {breakdown[f.key].points}/{f.max}
            </span>
          </span>
        ))}
      </p>
    );
  }
  return (
    <table className="mt-2 w-full text-sm">
      <tbody>
        {FACTORS.map((f) => (
          <tr key={f.key} className="align-top">
            <td className="w-28 py-0.5 pr-2 text-zinc-500">{f.label}</td>
            <td className={`w-14 py-0.5 pr-3 font-medium tabular-nums ${pointsClass(breakdown[f.key].points, f.max)}`}>
              {breakdown[f.key].points}/{f.max}
            </td>
            <td className="py-0.5 text-zinc-700 dark:text-zinc-300">{breakdown[f.key].note}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function pointsClass(points: number, max: number): string {
  const share = points / max;
  return share >= 0.8
    ? "text-emerald-700 dark:text-emerald-400"
    : share >= 0.5
      ? "text-zinc-700 dark:text-zinc-300"
      : "text-amber-700 dark:text-amber-400";
}

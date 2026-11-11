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

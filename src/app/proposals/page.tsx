import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { listSentSubmissions } from "@/lib/submissions";
import { setRepliedAction } from "../actions";
import { RefreshOutcomesButton } from "./refresh-button";
import { LocalTime } from "../local-time";
import { Gated } from "../profile-gate";

export default function ProposalsPage() {
  return (
    <Gated>
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Proposals</h1>
            <p className="text-sm text-zinc-500">
              Every proposal sent from here. Judge changes over at least 20 proposals: about 25–30% viewed is healthy, under 5% means
              something on the profile is wrong (Get Seen on Upwork, ch. 7).
            </p>
          </div>
          <RefreshOutcomesButton />
        </div>
        <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
          <Log />
        </Suspense>
      </main>
    </Gated>
  );
}

const SMALL_TIERS = new Set(["Fewer than 5", "5 to 10"]);

async function Log() {
  await connection();
  const rows = listSentSubmissions();
  if (rows.length === 0) return <p className="py-10 text-center text-sm text-zinc-500">No proposals sent yet.</p>;

  const sent = rows.filter((r) => r.status === "submitted");
  const viewed = sent.filter((r) => r.viewed).length;
  const replied = sent.filter((r) => r.replied).length;
  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");
  const small = sent.filter((r) => r.proposals_tier && SMALL_TIERS.has(r.proposals_tier));
  const big = sent.filter((r) => r.proposals_tier && !SMALL_TIERS.has(r.proposals_tier));
  const connects = sent.reduce((n, r) => n + (r.connects_cost ?? 0) + (r.boost_connects ?? 0), 0);

  return (
    <>
      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Tile label="Sent" value={String(sent.length)} />
        <Tile label="Viewed" value={pct(viewed, sent.length)} hint={sent.length < 20 ? "fewer than 20 sent" : undefined} />
        <Tile label="Replied" value={pct(replied, sent.length)} />
        <Tile label="Viewed: small / big jobs" value={`${pct(small.filter((r) => r.viewed).length, small.length)} / ${pct(big.filter((r) => r.viewed).length, big.length)}`} hint="viewed on small but not big jobs = visible but deep in the list" />
        <Tile label="Connects spent" value={String(connects)} />
      </section>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800">
            <tr>
              <th className="py-2 pr-3 font-medium">Date</th>
              <th className="py-2 pr-3 font-medium">Job</th>
              <th className="py-2 pr-3 font-medium">Proposals then</th>
              <th className="py-2 pr-3 font-medium">Rate vs budget</th>
              <th className="py-2 pr-3 font-medium">Connects</th>
              <th className="py-2 pr-3 font-medium">Viewed</th>
              <th className="py-2 pr-3 font-medium">Replied</th>
              <th className="py-2 font-medium">Upwork status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="py-2 pr-3 whitespace-nowrap text-zinc-500">{r.submitted_at ? <LocalTime iso={r.submitted_at} dateOnly /> : "—"}</td>
                <td className="py-2 pr-3">
                  <Link href={`/jobs/${r.job_id}`} className="hover:underline">
                    {r.title}
                  </Link>
                  {r.status === "submitting" && <span className="ml-2 text-xs text-amber-700">outcome unknown</span>}
                </td>
                <td className="py-2 pr-3 text-zinc-500">{r.proposals_tier ?? "—"}</td>
                <td className="py-2 pr-3 text-zinc-500">{r.rate_ratio ? `${r.rate_ratio.toFixed(2)}×` : "—"}</td>
                <td className="py-2 pr-3 text-zinc-500">
                  {r.connects_cost ?? "?"}
                  {r.boost_connects ? ` + ${r.boost_connects}⚡` : ""}
                </td>
                <td className="py-2 pr-3">{r.viewed === null ? "—" : r.viewed ? "Yes" : "No"}</td>
                <td className="py-2 pr-3">
                  <form action={setRepliedAction} className="flex gap-1">
                    <input type="hidden" name="submission_id" value={r.id} />
                    {(["1", "0"] as const).map((v) => (
                      <button
                        key={v}
                        name="replied"
                        value={r.replied === (v === "1") ? "" : v}
                        className={`rounded px-1.5 py-0.5 text-xs ${
                          r.replied === (v === "1") ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900" : "border border-zinc-300 dark:border-zinc-700"
                        }`}
                      >
                        {v === "1" ? "Yes" : "No"}
                      </button>
                    ))}
                  </form>
                </td>
                <td className="py-2 text-xs text-zinc-500">{r.upwork_status ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
      {hint && <p className="text-xs text-zinc-400">{hint}</p>}
    </div>
  );
}

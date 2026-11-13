import { Suspense } from "react";
import { connection } from "next/server";
import { evaluateHealth, extraFixes, type Condition } from "@/lib/health";
import { healthInputs } from "@/lib/health-data";
import { ManualHealthForm } from "./manual-form";
import { LoadProfileButton } from "./load-profile-button";
import { Gated } from "../profile-gate";

export default function HealthPage() {
  return (
    <Gated>
      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Profile health</h1>
        <p className="mb-6 text-sm text-zinc-500">
          How visible your proposals are likely to be, checked against the seven conditions in <em>Get Seen on Upwork 2026</em>.
          That book is an independent buyer-side study of 4,536 proposals, not Upwork&apos;s formula. Use it as a guide, not a
          guarantee.
        </p>
        <Suspense fallback={<p className="text-sm text-zinc-500">Checking…</p>}>
          <Health />
        </Suspense>
      </main>
    </Gated>
  );
}

const ICON: Record<Condition["status"], string> = { pass: "✓", fail: "✗", unknown: "?" };
const ICON_STYLE: Record<Condition["status"], string> = {
  pass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  fail: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  unknown: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
};
const RISK_STYLE = {
  high: "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200",
  medium: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  low: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
};

async function Health() {
  await connection();
  const { inputs, profileLoaded } = healthInputs();

  if (!profileLoaded) {
    return (
      <div className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
        <p className="mb-3">Your Upwork profile isn&apos;t loaded yet.</p>
        <LoadProfileButton />
      </div>
    );
  }

  const h = evaluateHealth(inputs);
  const fixes = [...h.conditions.filter((c) => c.status === "fail" && c.fix).map((c) => c.fix!), ...extraFixes(inputs)];
  const oddsText = h.odds.low === h.odds.high ? `${h.odds.low} in 100` : `${h.odds.low}–${h.odds.high} in 100`;

  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs text-zinc-500">Conditions met</p>
          <p className="text-3xl font-semibold">
            {h.met}
            <span className="text-lg text-zinc-400"> / 7</span>
          </p>
          {h.unknown > 0 && <p className="text-xs text-zinc-500">{h.unknown} not confirmed yet</p>}
        </div>
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs text-zinc-500">Page-one odds in the study</p>
          <p className="text-3xl font-semibold">{oddsText}</p>
          <p className="text-xs text-zinc-500">All seven: 37 in 100. Two or fewer: 0.</p>
        </div>
        <div className={`rounded-lg border p-4 text-sm ${RISK_STYLE[h.hiddenRisk.level]}`}>
          <p className="text-xs opacity-80">Hidden-folder risk</p>
          <p className="text-lg font-semibold capitalize">{h.hiddenRisk.level}</p>
          <p className="text-xs">{h.hiddenRisk.detail}</p>
        </div>
      </section>

      {fixes.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">Fix these, in this order</h2>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
            {fixes.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ol>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-lg font-semibold">The seven conditions</h2>
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {h.conditions.map((c) => (
            <li key={c.id} className="flex gap-3 p-3">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${ICON_STYLE[c.status]}`}>
                {ICON[c.status]}
              </span>
              <div className="text-sm">
                <p className="font-medium">
                  {c.label}
                  {c.source === "manual" && <span className="ml-2 text-xs font-normal text-zinc-400">you confirm</span>}
                </p>
                <p className="text-zinc-500">{c.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold">Confirm what the API can&apos;t see</h2>
        <p className="mb-3 text-sm text-zinc-500">Check these on your Upwork profile page, then set them here.</p>
        <ManualHealthForm manual={inputs.manual} />
      </section>
    </div>
  );
}

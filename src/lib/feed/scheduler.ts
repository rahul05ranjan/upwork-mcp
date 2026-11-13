import "server-only";
import { lastRun, runFeed } from "./run";
import { getSettings } from "./settings";
import { activeProfile } from "@/lib/session";

// Checks once a minute whether a run is due. Reading the interval on every tick
// means a settings change takes effect without restarting the server.

const TICK_MS = 60_000;
const g = globalThis as unknown as { __feedScheduler?: NodeJS.Timeout };

async function tick() {
  try {
    // Nobody connected: there is no profile to search for.
    if (!activeProfile()) return;
    const { intervalMinutes } = getSettings();
    if (!intervalMinutes) return;
    const last = lastRun();
    const lastAt = last ? Date.parse(last.started_at) : 0;
    if (Date.now() - lastAt < intervalMinutes * 60_000) return;
    const summary = await runFeed("schedule");
    console.log(`[feed] scheduled run: ${summary.found} found, ${summary.newJobs} new`, summary.messages.join(" | "));
  } catch (err) {
    console.error("[feed] scheduler tick failed", err);
  }
}

export function startScheduler() {
  if (g.__feedScheduler) return;
  g.__feedScheduler = setInterval(tick, TICK_MS);
  g.__feedScheduler.unref();
  console.log("[feed] scheduler started (checks every minute)");
}

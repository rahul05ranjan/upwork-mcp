import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateHealth, extraFixes, median, pageOneOdds, rateVsBudget, type HealthInputs } from "./health.ts";
import { letterChecks, previewOf, wordCount } from "./ai/letter-checks.ts";

const base: HealthInputs = {
  earned: true,
  employmentEntries: 3,
  hourlyRate: 30,
  typicalRate: 25,
  typicalRateSample: 8,
  lastContractDate: "2026-06-01T00:00:00Z",
  portfolioItems: 18,
  freelancerAccount: true,
  manual: { complete100: true, hireAgain90: true, responseTimeShown: true },
  now: new Date("2026-11-11T00:00:00Z"),
};

test("a strong profile meets all seven", () => {
  const h = evaluateHealth(base);
  assert.equal(h.met, 7);
  assert.equal(h.unknown, 0);
  assert.deepEqual(h.odds, { low: 37, high: 37 });
  assert.equal(h.hiddenRisk.level, "low");
  assert.deepEqual(extraFixes(base), []);
});

test("the user's real shape: low rate, stale record, unknown manual fields", () => {
  const h = evaluateHealth({
    ...base,
    employmentEntries: 1,
    hourlyRate: 15,
    typicalRate: 20,
    lastContractDate: "2023-02-15T00:00:00Z",
    portfolioItems: 4,
    manual: {},
  });
  const byId = Object.fromEntries(h.conditions.map((c) => [c.id, c.status]));
  assert.equal(byId.rate, "fail");
  assert.equal(byId.recent, "fail");
  assert.equal(byId.earned, "pass");
  assert.equal(byId.notAgencyOnly, "pass");
  assert.equal(byId.complete, "unknown");
  assert.equal(h.met, 2);
  assert.equal(h.unknown, 3);
  assert.deepEqual(h.odds, { low: 0, high: 14 });
  assert.equal(h.hiddenRisk.level, "low"); // one entry but has earned
  assert.equal(extraFixes({ ...base, employmentEntries: 1, portfolioItems: 4 }).length, 2);
});

test("empty employment history fails completeness and is a high hidden risk", () => {
  const h = evaluateHealth({ ...base, employmentEntries: 0, manual: { complete100: true } });
  assert.equal(h.conditions.find((c) => c.id === "complete")!.status, "fail");
  assert.equal(h.hiddenRisk.level, "high");
});

test("rate is unknown with too few hourly jobs", () => {
  const h = evaluateHealth({ ...base, typicalRateSample: 3 });
  assert.equal(h.conditions.find((c) => c.id === "rate")!.status, "unknown");
});

test("an active contract counts as recent work", () => {
  const h = evaluateHealth({ ...base, lastContractDate: "2020-01-01", manual: { ...base.manual, activeContract: true } });
  assert.equal(h.conditions.find((c) => c.id === "recent")!.status, "pass");
});

test("odds table matches the book", () => {
  assert.deepEqual([0, 2, 3, 4, 5, 6, 7].map(pageOneOdds), [0, 0, 5, 8, 14, 29, 37]);
});

test("rateVsBudget uses the posted range midpoint", () => {
  assert.deepEqual(rateVsBudget(15, 25, 50), { ratio: 0.4, typical: 37.5, verdict: "below" });
  assert.equal(rateVsBudget(40, 25, 35)?.verdict, "strong");
  assert.equal(rateVsBudget(31, 30, null)?.verdict, "ok");
  assert.equal(rateVsBudget(undefined, 25, 50), undefined);
});

test("median", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), undefined);
});

test("letter checks flag greetings, length and a missing question", () => {
  const bad = letterChecks("Hi there,\n\nI am a developer with many years of experience.\n\nThanks");
  assert.deepEqual(bad.map((c) => c.ok), [false, false, false]);

  const good = letterChecks(
    `A Shopify refund does not revoke the download link, so a refunded test order still leaves a live file URL. ${"word ".repeat(120)}\n\nWhich payment provider are you using today?\n\nBest, Rahul`,
  );
  assert.deepEqual(good.map((c) => c.ok), [true, true, true]);
});

test("preview is the first 230 characters, whitespace flattened", () => {
  const p = previewOf("Line one\n\n" + "x".repeat(400));
  assert.equal(p.endsWith("…"), true);
  assert.ok(p.length <= 231);
  assert.equal(wordCount("  two words "), 2);
});

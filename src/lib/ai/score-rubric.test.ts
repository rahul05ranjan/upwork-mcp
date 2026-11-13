import { test } from "node:test";
import assert from "node:assert/strict";
import { FACTORS, normalizeBreakdown, totalScore, verdictFor, type Breakdown } from "./score-rubric.ts";

const b = (skills: number, pay: number, client: number, competition: number, clarity: number): Breakdown => ({
  skills: { points: skills, note: "" },
  pay: { points: pay, note: "" },
  client: { points: client, note: "" },
  competition: { points: competition, note: "" },
  clarity: { points: clarity, note: "" },
});

test("factor maxima add up to 100", () => {
  assert.equal(FACTORS.reduce((s, f) => s + f.max, 0), 100);
});

test("total is the sum of the factor points", () => {
  assert.equal(totalScore(b(32, 18, 12, 6, 4)), 72);
  assert.equal(totalScore(b(40, 20, 20, 10, 10)), 100);
});

test("out-of-range points are clamped, not trusted", () => {
  assert.equal(totalScore(b(55, -3, 20.6, 10, Number.NaN)), 40 + 0 + 20 + 10 + 0);
  assert.equal(normalizeBreakdown(b(55, 5, 5, 5, 5)).skills.points, 40);
});

test("verdict bands match the instructions", () => {
  assert.equal(verdictFor(80), "strong");
  assert.equal(verdictFor(79), "maybe");
  assert.equal(verdictFor(50), "maybe");
  assert.equal(verdictFor(49), "weak");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RULES } from "./parse.ts";
import { MAX_SKILL_SEARCHES, RECOMMENDED_SEARCH, rulesFromProfile, searchesFromProfile } from "./profile-seed.ts";

test("a new profile gets recommendations plus one search per skill", () => {
  const seeds = searchesFromProfile(["Laravel", "Node.js"], []);
  assert.deepEqual(seeds[0], RECOMMENDED_SEARCH);
  assert.deepEqual(
    seeds.slice(1).map((s) => [s.name, s.kind, s.params.skills]),
    [
      ["Laravel jobs", "search", ["Laravel"]],
      ["Node.js jobs", "search", ["Node.js"]],
    ],
  );
  assert.equal(seeds[1].params.sort, "recency");
  assert.equal(seeds[1].params.verified_payment_only, true);
});

test("skill searches are capped and deduplicated", () => {
  const skills = ["PHP", "php ", "A", "B", "C", "D", "E", "F"];
  const seeds = searchesFromProfile(skills, []).filter((s) => s.kind === "search");
  assert.equal(seeds.length, MAX_SKILL_SEARCHES);
  assert.deepEqual(seeds.map((s) => s.params.skills), [["PHP"], ["A"], ["B"], ["C"], ["D"]]);
});

test("searches the profile already has are not added again", () => {
  const existing = [
    { kind: "smart" as const, params: { mode: "best_match" } },
    { kind: "search" as const, params: { skills: ["laravel"] } },
  ];
  const seeds = searchesFromProfile(["Laravel", "React"], existing);
  assert.deepEqual(seeds.map((s) => s.name), ["React jobs"]);
});

test("min hourly rate comes from the profile only when the user hasn't set one", () => {
  assert.equal(rulesFromProfile(DEFAULT_RULES, 15).minHourlyRate, 15);
  assert.equal(rulesFromProfile({ ...DEFAULT_RULES, minHourlyRate: 25 }, 15).minHourlyRate, 25);
  assert.equal(rulesFromProfile(DEFAULT_RULES, undefined), DEFAULT_RULES);
});

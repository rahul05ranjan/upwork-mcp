import { test } from "node:test";
import assert from "node:assert/strict";
import { boostAdvice, checkConnects } from "./boost.ts";
import { findKey, needsConnects, needsPolicyAck, parsePreview } from "./proposal-preview.ts";

test("boost arithmetic matches the book's worked example", () => {
  // 2% win rate, a quarter uplift (we use Upwork's 24%), 40 Connects = $6.
  const small = boostAdvice({ boostConnects: 40, winRate: 0.02, jobProfitUsd: 300 });
  assert.equal(small.costUsd, 6);
  assert.equal(small.expectedGainUsd, 1.44);
  assert.equal(small.worthIt, false);

  const big = boostAdvice({ boostConnects: 40, winRate: 0.02, jobProfitUsd: 2000 });
  assert.equal(big.expectedGainUsd, 9.6);
  assert.equal(big.worthIt, true);
  assert.equal(big.breakEvenConnects, 64);
});

test("never boost an unfinished profile", () => {
  const a = boostAdvice({ boostConnects: 5, winRate: 0.05, jobProfitUsd: 5000, healthMet: 3 });
  assert.equal(a.worthIt, false);
  assert.match(a.reasons.join(" "), /never boost an unfinished profile/);
});

test("connects limits", () => {
  const limits = { maxPerProposal: 30, maxPerDay: 60 };
  assert.equal(checkConnects({ cost: 16, boost: 0, balance: 100, spentLast24h: 0, limits }), null);
  assert.match(checkConnects({ cost: 16, boost: 0, balance: 10, spentLast24h: 0, limits })!, /balance is 10/);
  assert.match(checkConnects({ cost: 16, boost: 20, balance: 100, spentLast24h: 0, limits })!, /per-proposal limit/);
  assert.match(checkConnects({ cost: 16, boost: 0, balance: 100, spentLast24h: 50, limits })!, /daily limit/);
});

test("parsePreview finds fields wherever Upwork nests them", () => {
  const body = {
    status: "ok",
    preview_id: "pv_1",
    preview: {
      connects_cost: 16,
      connects_balance: "40",
      can_apply: true,
      plan: "Basic",
      bid_stats_available: false,
      bid_stats_note: "Upgrade to see bids",
      screening_questions: [{ question: "What is your experience with Kotlin?" }, "Share a Play Store link"],
      unmet_preferred_qualifications: ["Job Success Score 90%+"],
      additional_preferences: { regions: ["Europe"], note: "Regions never block applying" },
      boost: {
        available: true,
        recommended_connects: 3,
        max_boost_connects: 24,
        current_top_bids: [{ connects: 12 }, 8, "5"],
        current_top_bids_available: true,
        note: "4 paid slots",
      },
    },
    note: "Present the full preview to the user.",
  };
  const p = parsePreview(body);
  assert.equal(p.previewId, "pv_1");
  assert.equal(p.connectsCost, 16);
  assert.equal(p.connectsBalance, 40);
  assert.equal(p.canApply, true);
  assert.equal(p.bidStatsNote, "Upgrade to see bids");
  assert.deepEqual(p.screeningQuestions, ["What is your experience with Kotlin?", "Share a Play Store link"]);
  assert.deepEqual(p.unmetQualifications, ["Job Success Score 90%+"]);
  assert.deepEqual(p.additionalPreferences, ["regions: Europe", "note: Regions never block applying"]);
  assert.deepEqual(p.boost, {
    available: true,
    reason: undefined,
    recommendation: undefined,
    rationale: undefined,
    recommendedConnects: 3,
    minBoostConnects: undefined,
    maxBoostConnects: 24,
    topSlots: undefined,
    currentTopBids: [12, 8, 5],
    currentTopBidsAvailable: true,
    suggestedBid: undefined,
    note: "4 paid slots",
  });
  assert.deepEqual(p.notes, ["Present the full preview to the user."]);
});

test("parsePreview tolerates an empty body", () => {
  const p = parsePreview({});
  assert.equal(p.previewId, undefined);
  assert.deepEqual(p.screeningQuestions, []);
  assert.equal(p.boost, undefined);
});

test("findKey and error detectors", () => {
  assert.equal(findKey({ a: [{ b: { c: 1 } }] }, "c"), 1);
  assert.equal(needsConnects("You don't have enough Connects right now to submit this proposal."), true);
  assert.equal(needsPolicyAck("Call acknowledge_policy after the user confirms"), true);
  assert.equal(needsPolicyAck("all good"), false);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { isErrorReply, parsePreview, previewExpired } from "./proposal-preview.ts";

// Trimmed from the first real manage_proposals create reply (2026-11-12).
const LIVE_PREVIEW = {
  expires_at: "2026-11-12T08:52:47Z",
  message: "Preview prepared (NOT executed). Present the full preview to the user in plain language; … preview_id … internal.",
  params: { chargedAmount: 60, connects_cost: 13, jobReference: "2120302727535935958" },
  preview: {
    additional_preferences: ["Preferred countries: United States"],
    additional_preferences_note: "The client listed preferences that your profile may not meet. …",
    attachments: [],
    bid_stats_available: false,
    bid_stats_note: "What other applicants bid is a Freelancer Plus feature …",
    boost: {
      current_top_bids: [30, 4, 3],
      max_boost_connects: 184,
      min_boost_connects: 3,
      note: "Boosting is a bid (in connects) for a top slot …",
      rationale: "Only 3 applicant(s) have boosted — fewer than the 4 paid slots, so 3 connects (this auction's minimum bid) earns you a top slot.",
      recommended_connects: 3,
      suggested_bid: { median_winning_bid: 65, note: "Upwork's figures for SIMILAR jobs …", p80_winning_bid: 151, p90_winning_bid: 231 },
      top_slots: 4,
      your_balance: 197,
    },
    can_apply: true,
    charged_amount: 60,
    connects_balance: 197,
    connects_cost: 13,
    cover_letter: "I would handle this as risk-reduction work…",
    cover_letter_required: true,
    plan: "Freelancer Basic",
    preferred_locations_note: "The client prefers freelancers in United States (advisory — anyone may apply).",
    preview_text:
      "Cover letter:\nI would handle this as risk-reduction work…\n\nBid: $60\n\nPast Upwork jobs:\n- <untrusted_participant_content>\nBuild a collaborative-edit app\n</untrusted_participant_content> (client score 5.0)\n\nConnects: 13 (balance 197)",
    screening_answers: [],
  },
  preview_id: "3b4543e0-8982-453d-9491-faa59a515ff0",
  status: "preview",
  ttl_seconds: 899,
  type: "proposal",
};

test("a live preview reply is not an error", () => {
  assert.equal(isErrorReply(false, LIVE_PREVIEW), false);
  assert.equal(isErrorReply(false, { status: "ok" }), false);
  assert.equal(isErrorReply(false, { status: "error", error: "nope" }), true);
  assert.equal(isErrorReply(false, { error: "nope" }), true);
  assert.equal(isErrorReply(false, { status: "failed" }), true);
  assert.equal(isErrorReply(true, { status: "preview" }), true);
  assert.equal(isErrorReply(false, undefined), false);
});

test("parsePreview reads the live preview shape", () => {
  const p = parsePreview(LIVE_PREVIEW);
  assert.equal(p.previewId, "3b4543e0-8982-453d-9491-faa59a515ff0");
  assert.equal(p.expiresAt, "2026-11-12T08:52:47Z");
  assert.equal(p.connectsCost, 13);
  assert.equal(p.connectsBalance, 197);
  assert.equal(p.chargedAmount, 60);
  assert.equal(p.canApply, true);
  assert.equal(p.plan, "Freelancer Basic");
  assert.equal(p.bidStatsAvailable, false);
  assert.deepEqual(p.additionalPreferences, ["Preferred countries: United States"]);
  assert.deepEqual(p.screeningQuestions, []);

  assert.equal(p.boost?.available, true, "a bid range means boosting is open even without an `available` flag");
  assert.deepEqual(p.boost?.currentTopBids, [30, 4, 3]);
  assert.equal(p.boost?.minBoostConnects, 3);
  assert.equal(p.boost?.maxBoostConnects, 184);
  assert.equal(p.boost?.recommendedConnects, 3);
  assert.equal(p.boost?.topSlots, 4);
  assert.deepEqual(p.boost?.suggestedBid, { median: 65, p80: 151, p90: 231 });
  assert.match(p.boost?.rationale ?? "", /fewer than the 4 paid slots/);

  assert.ok(p.previewText?.startsWith("Cover letter:"));
  assert.ok(!p.previewText?.includes("untrusted_participant_content"), "Upwork's wrapper tags are stripped for display");
  assert.ok(p.previewText?.includes("Build a collaborative-edit app"));

  assert.ok(!p.notes.some((n) => n.includes("Preview prepared")), "the agent-directed message is not shown as a note");
  assert.ok(p.notes.some((n) => n.includes("prefers freelancers in United States")));
});

test("previewExpired compares against expires_at", () => {
  const at = Date.parse("2026-11-12T08:52:47Z");
  assert.equal(previewExpired({ expiresAt: "2026-11-12T08:52:47Z" }, at - 1000), false);
  assert.equal(previewExpired({ expiresAt: "2026-11-12T08:52:47Z" }, at), true);
  assert.equal(previewExpired({}, at), false);
});

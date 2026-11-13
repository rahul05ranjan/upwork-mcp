import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_RULES,
  evaluateRules,
  parseBudget,
  parseMoney,
  parseSearchResponse,
  stripUntrustedTags,
  type Rules,
  type UpworkJob,
} from "./parse.ts";

test("parseBudget handles each Upwork budget format", () => {
  assert.deepEqual(parseBudget("3,500.00"), { min: 3500, max: 3500, hourly: false });
  assert.deepEqual(parseBudget("$50.00"), { min: 50, max: 50, hourly: false });
  assert.deepEqual(parseBudget("25.00–50.00/hr"), { min: 25, max: 50, hourly: true });
  assert.deepEqual(parseBudget("up to 40.00/hr"), { max: 40, hourly: true });
  assert.deepEqual(parseBudget("30.00+/hr"), { min: 30, hourly: true });
  assert.deepEqual(parseBudget(undefined), { hourly: false });
});

test("parseMoney reads client spend", () => {
  assert.equal(parseMoney("$22,151.41"), 22151.41);
  assert.equal(parseMoney("$1.2K"), 1200);
  assert.equal(parseMoney("$3M+"), 3_000_000);
  assert.equal(parseMoney("$0"), 0);
  assert.equal(parseMoney(undefined), undefined);
});

test("stripUntrustedTags removes Upwork's wrapper", () => {
  assert.equal(stripUntrustedTags("<untrusted_participant_content>\nHello\n</untrusted_participant_content>"), "Hello");
});

test("parseSearchResponse reads jobs, cursor and warnings", () => {
  const body = {
    status: "ok",
    hasMore: true,
    jobs: [{ id: "1", title: "A" }, { title: "no id" }],
    pageInfo: { endCursor: "2", hasNextPage: true },
    filters_ignored: ["Reactt"],
  };
  const page = parseSearchResponse({ content: [{ type: "text", text: JSON.stringify(body) }] });
  assert.equal(page.jobs.length, 1);
  assert.equal(page.nextCursor, "2");
  assert.equal(page.hasMore, true);
  assert.match(page.warnings[0], /Reactt/);
});

test("parseSearchResponse prefers next_cursor (smart_search)", () => {
  const body = { status: "ok", hasMore: true, jobs: [], next_cursor: "t:179" };
  assert.equal(parseSearchResponse({ content: [{ type: "text", text: JSON.stringify(body) }] }).nextCursor, "t:179");
});

test("parseSearchResponse surfaces errors", () => {
  assert.throws(() => parseSearchResponse({ isError: true, content: [{ type: "text", text: "Rate limited" }] }), /Rate limited/);
  assert.throws(
    () => parseSearchResponse({ content: [{ type: "text", text: JSON.stringify({ status: "error", error: "bad skill" }) }] }),
    /bad skill/,
  );
});

const good: UpworkJob = {
  id: "1",
  title: "React developer",
  job_type: "hourly",
  budget: "25.00–50.00/hr",
  proposals_tier: "10 to 15",
  client: { country: "Denmark", rating: 4.9, total_reviews: 30, total_spent: "$22,151.41", verification_status: "VERIFIED" },
  job_activity: { total_hired: 0 },
};
const rules: Rules = { ...DEFAULT_RULES, minHourlyRate: 30, minFixedBudget: 200, minClientSpend: 1000, minClientRating: 4.5 };

test("a good job passes the rules", () => {
  assert.equal(evaluateRules(good, rules), null);
});

test("each rule rejects with a reason", () => {
  const cases: [Partial<UpworkJob>, RegExp][] = [
    [{ applied: true }, /applied/],
    [{ client: { ...good.client, verification_status: "UNVERIFIED" } }, /not verified/],
    [{ job_activity: { total_hired: 1 } }, /already hired/],
    [{ budget: "10.00–20.00/hr" }, /below \$30\/hr/],
    [{ job_type: "fixed", budget: "$50.00" }, /below \$200/],
    [{ client: { ...good.client, total_spent: "$300" } }, /Client spent/],
    [{ client: { ...good.client, rating: 3.2 } }, /rating 3.2/],
    [{ proposals_tier: "50+" }, /Too many proposals/],
  ];
  for (const [patch, reason] of cases) {
    assert.match(evaluateRules({ ...good, ...patch }, rules) ?? "", reason, JSON.stringify(patch));
  }
});

test("hourly floor keeps jobs whose range reaches the floor, and open-ended ones", () => {
  assert.equal(evaluateRules({ ...good, budget: "20.00–35.00/hr" }, rules), null);
  assert.equal(evaluateRules({ ...good, budget: "30.00+/hr" }, rules), null);
  assert.equal(evaluateRules({ ...good, budget: undefined }, rules), null);
});

test("age rule hides old posts, judged at the given time", () => {
  const now = Date.parse("2026-11-12T12:00:00Z");
  const posted = (iso: string) => ({ ...good, published_date: iso });
  assert.equal(evaluateRules(posted("2026-11-12T09:00:00Z"), rules, now), null, "3 hours old passes");
  assert.equal(evaluateRules(posted("2026-11-09T13:00:00Z"), rules, now), null, "71 hours old passes");
  assert.match(evaluateRules(posted("2026-11-08T12:00:00Z"), rules, now) ?? "", /Posted 4 days ago \(older than 72 hours\)/);
  assert.match(evaluateRules(posted("2023-06-22T14:38:14Z"), rules, now) ?? "", /Posted 3 years ago/);
  assert.equal(evaluateRules(posted("2023-06-22T14:38:14Z"), { ...rules, maxAgeHours: 0 }, now), null, "0 turns it off");
  assert.equal(evaluateRules({ ...good, created_date: "2023-01-01T00:00:00Z" }, rules, now) !== null, true, "falls back to created_date");
  assert.equal(evaluateRules(good, rules, now), null, "no date: not filtered");
});

test("rating rule ignores clients with no reviews", () => {
  assert.equal(evaluateRules({ ...good, client: { ...good.client, rating: 0, total_reviews: 0 } }, rules), null);
});

test("country and keyword exclusions are case-insensitive", () => {
  assert.match(evaluateRules(good, { ...rules, excludeCountries: ["denmark"] }) ?? "", /country/);
  assert.match(
    evaluateRules({ ...good, description_snippet: "Need a WordPress fix" }, { ...rules, excludeKeywords: ["wordpress"] }) ?? "",
    /wordpress/,
  );
});

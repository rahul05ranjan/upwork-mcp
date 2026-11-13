// Reads Upwork's proposal preview (manage_proposals create / accept_invitation).
// Fields are found by name anywhere in the response; the real shape (first
// seen 2026-11-12) is in docs/upwork-mcp-notes.md. Pure functions; unit-tested.

type Obj = Record<string, unknown>;

export type BoostInfo = {
  available: boolean;
  reason?: string;
  recommendation?: string;
  /** Upwork's one-line reason for its recommended bid on this job. */
  rationale?: string;
  recommendedConnects?: number;
  /** The auction drops bids below this. */
  minBoostConnects?: number;
  maxBoostConnects?: number;
  topSlots?: number;
  currentTopBids?: number[];
  currentTopBidsAvailable?: boolean;
  /** Winning bids on SIMILAR jobs last week: context only, never bids on this job. */
  suggestedBid?: { median?: number; p80?: number; p90?: number };
  note?: string;
};

export type ProposalPreview = {
  previewId?: string;
  /** When Upwork stops accepting confirm for this preview (about 15 minutes). */
  expiresAt?: string;
  connectsCost?: number;
  connectsBalance?: number;
  canApply?: boolean;
  /** The bid as Upwork will send it. */
  chargedAmount?: number;
  plan?: string;
  bidStats?: unknown;
  bidStatsAvailable?: boolean;
  bidStatsNote?: string;
  boost?: BoostInfo;
  screeningQuestions: string[];
  unmetQualifications: string[];
  /** Client preferences the profile may not meet, e.g. "Preferred countries: United States". */
  additionalPreferences: string[];
  /**
   * The proposal exactly as the client will receive it. Upwork requires the
   * user to see it in full and unedited before approving.
   */
  previewText?: string;
  /** Fields Upwork says it still needs (e.g. application_method, payment_mode). */
  requirements: string[];
  /** Other notes for the user. */
  notes: string[];
};

/**
 * True when an Upwork tool reply is a failure. Success replies carry other
 * statuses too: a proposal preview comes back with status "preview".
 */
export function isErrorReply(isError: boolean | undefined, body: Obj | undefined): boolean {
  if (isError) return true;
  const status = typeof body?.status === "string" ? body.status.toLowerCase() : undefined;
  if (status && /^(error|errored|fail|failed|failure|rejected|denied|invalid|forbidden)$/.test(status)) return true;
  // An error field with no success status means failure.
  return Boolean(body?.error) && (status === undefined || status === "error");
}

const UNTRUSTED_TAGS = /<\/?untrusted_participant_content>/g;

/** Depth-first search for the first value under `key`. */
export function findKey(node: unknown, key: string, depth = 0): unknown {
  if (!node || typeof node !== "object" || depth > 6) return undefined;
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = findKey(item, key, depth + 1);
      if (hit !== undefined) return hit;
    }
    return undefined;
  }
  const o = node as Obj;
  if (key in o) return o[key];
  for (const v of Object.values(o)) {
    const hit = findKey(v, key, depth + 1);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined);
const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined);

function textList(v: unknown): string[] {
  if (!Array.isArray(v)) return typeof v === "string" && v ? [v] : [];
  return v
    .map((x) => {
      if (typeof x === "string") return x;
      const o = (x ?? {}) as Obj;
      return str(o.question) ?? str(o.text) ?? str(o.label) ?? str(o.name) ?? (Object.keys(o).length ? JSON.stringify(o) : undefined);
    })
    .filter((s): s is string => !!s);
}

/** Live replies send a list of strings; an object is flattened to "key: value" lines so nothing is lost. */
function preferenceList(v: unknown): string[] {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return Object.entries(v as Obj).map(([k, x]) => `${k.replace(/_/g, " ")}: ${Array.isArray(x) ? x.join(", ") : typeof x === "object" ? JSON.stringify(x) : String(x)}`);
  }
  return textList(v);
}

export function parsePreview(body: unknown): ProposalPreview {
  const boostRaw = findKey(body, "boost") as Obj | undefined;
  const suggested = (boostRaw?.suggested_bid ?? undefined) as Obj | undefined;
  const maxBoost = boostRaw ? num(boostRaw.max_boost_connects) : undefined;
  const boost: BoostInfo | undefined =
    boostRaw && typeof boostRaw === "object"
      ? {
          // The live preview has no `available` flag; a bid range means boosting is open.
          available: bool(boostRaw.available) ?? (maxBoost !== undefined && maxBoost > 0),
          reason: str(boostRaw.reason),
          recommendation: str(boostRaw.recommendation),
          rationale: str(boostRaw.rationale),
          recommendedConnects: num(boostRaw.recommended_connects),
          minBoostConnects: num(boostRaw.min_boost_connects),
          maxBoostConnects: maxBoost,
          topSlots: num(boostRaw.top_slots),
          currentTopBids: Array.isArray(boostRaw.current_top_bids)
            ? boostRaw.current_top_bids.map((b) => num(typeof b === "object" && b ? (b as Obj).connects ?? (b as Obj).bid : b)).filter((n): n is number => n !== undefined)
            : undefined,
          currentTopBidsAvailable: bool(boostRaw.current_top_bids_available),
          suggestedBid:
            suggested && typeof suggested === "object"
              ? { median: num(suggested.median_winning_bid), p80: num(suggested.p80_winning_bid), p90: num(suggested.p90_winning_bid) }
              : undefined,
          note: str(boostRaw.note),
        }
      : undefined;

  const requirements: string[] = [];
  for (const key of ["application_method_required", "requires_application_method", "payment_mode_required", "missing_fields", "required_fields"]) {
    requirements.push(...textList(findKey(body, key)));
  }

  // The top-level `message` is addressed to an AI agent ("present the preview…,
  // preview_id is internal"), not to the user, so it is left out.
  const notes: string[] = [];
  for (const key of ["note", "notes", "warning", "warnings"]) {
    notes.push(...textList((body as Obj | undefined)?.[key]));
  }
  notes.push(...textList(findKey(body, "preferred_locations_note")));

  const previewText = str(findKey(body, "preview_text"));
  return {
    previewId: str(findKey(body, "preview_id")),
    expiresAt: str(findKey(body, "expires_at")),
    connectsCost: num(findKey(body, "connects_cost")),
    connectsBalance: num(findKey(body, "connects_balance")),
    canApply: bool(findKey(body, "can_apply")),
    chargedAmount: num(findKey(body, "charged_amount")),
    plan: str(findKey(body, "plan")),
    bidStats: findKey(body, "bid_stats"),
    bidStatsAvailable: bool(findKey(body, "bid_stats_available")),
    bidStatsNote: str(findKey(body, "bid_stats_note")),
    boost,
    screeningQuestions: textList(findKey(body, "screening_questions")),
    unmetQualifications: textList(findKey(body, "unmet_preferred_qualifications")),
    additionalPreferences: preferenceList(findKey(body, "additional_preferences")),
    previewText: previewText?.replace(UNTRUSTED_TAGS, "").replace(/\n{3,}/g, "\n\n").trim(),
    requirements: [...new Set(requirements)],
    notes: [...new Set(notes)],
  };
}

/** True once Upwork would no longer accept confirm for this preview. */
export function previewExpired(preview: Pick<ProposalPreview, "expiresAt">, now = Date.now()): boolean {
  const at = preview.expiresAt ? Date.parse(preview.expiresAt) : NaN;
  return Number.isFinite(at) && now >= at;
}

/** Upwork asks for this acknowledgement before some proposals; we surface it to the user. */
export function needsPolicyAck(text: string): boolean {
  return /acknowledge_policy|disintermediation/i.test(text);
}

export function needsConnects(text: string): boolean {
  return /enough connects/i.test(text);
}

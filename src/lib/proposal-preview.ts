// Reads Upwork's proposal preview (manage_proposals create / accept_invitation).
// The exact nesting isn't documented, so fields are found by name anywhere in
// the response. Pure functions; unit-tested.

type Obj = Record<string, unknown>;

export type BoostInfo = {
  available: boolean;
  reason?: string;
  recommendation?: string;
  recommendedConnects?: number;
  maxBoostConnects?: number;
  currentTopBids?: number[];
  currentTopBidsAvailable?: boolean;
  note?: string;
};

export type ProposalPreview = {
  previewId?: string;
  connectsCost?: number;
  connectsBalance?: number;
  canApply?: boolean;
  plan?: string;
  bidStats?: unknown;
  bidStatsNote?: string;
  boost?: BoostInfo;
  screeningQuestions: string[];
  unmetQualifications: string[];
  additionalPreferences?: string;
  /** Fields Upwork says it still needs (e.g. application_method, payment_mode). */
  requirements: string[];
  /** Any other notes or messages Upwork attached. */
  notes: string[];
};

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

export function parsePreview(body: unknown): ProposalPreview {
  const boostRaw = findKey(body, "boost") as Obj | undefined;
  const boost: BoostInfo | undefined =
    boostRaw && typeof boostRaw === "object"
      ? {
          available: bool(boostRaw.available) ?? false,
          reason: str(boostRaw.reason),
          recommendation: str(boostRaw.recommendation),
          recommendedConnects: num(boostRaw.recommended_connects),
          maxBoostConnects: num(boostRaw.max_boost_connects),
          currentTopBids: Array.isArray(boostRaw.current_top_bids)
            ? boostRaw.current_top_bids.map((b) => num(typeof b === "object" && b ? (b as Obj).connects ?? (b as Obj).bid : b)).filter((n): n is number => n !== undefined)
            : undefined,
          currentTopBidsAvailable: bool(boostRaw.current_top_bids_available),
          note: str(boostRaw.note),
        }
      : undefined;

  const requirements: string[] = [];
  for (const key of ["application_method_required", "requires_application_method", "payment_mode_required", "missing_fields", "required_fields"]) {
    requirements.push(...textList(findKey(body, key)));
  }

  const notes: string[] = [];
  for (const key of ["note", "message", "notes", "warning", "warnings"]) {
    const v = (body as Obj | undefined)?.[key];
    notes.push(...textList(v));
  }

  const additional = findKey(body, "additional_preferences");
  return {
    previewId: str(findKey(body, "preview_id")),
    connectsCost: num(findKey(body, "connects_cost")),
    connectsBalance: num(findKey(body, "connects_balance")),
    canApply: bool(findKey(body, "can_apply")),
    plan: str(findKey(body, "plan")),
    bidStats: findKey(body, "bid_stats"),
    bidStatsNote: str(findKey(body, "bid_stats_note")),
    boost,
    screeningQuestions: textList(findKey(body, "screening_questions")),
    unmetQualifications: textList(findKey(body, "unmet_preferred_qualifications")),
    additionalPreferences: additional === undefined ? undefined : typeof additional === "string" ? additional : JSON.stringify(additional),
    requirements: [...new Set(requirements)],
    notes: [...new Set(notes)],
  };
}

/** Upwork asks for this acknowledgement before some proposals; we surface it to the user. */
export function needsPolicyAck(text: string): boolean {
  return /acknowledge_policy|disintermediation/i.test(text);
}

export function needsConnects(text: string): boolean {
  return /enough connects/i.test(text);
}

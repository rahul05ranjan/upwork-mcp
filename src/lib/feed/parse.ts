// Pure helpers for Upwork job search results. No server-only imports, so the
// tests can run them directly with `node --test`.

export type UpworkClient = {
  country?: string;
  rating?: number;
  total_reviews?: number;
  total_spent?: string;
  total_posted_jobs?: number;
  total_hires?: number;
  verification_status?: string;
};

export type UpworkJob = {
  id: string;
  title: string;
  url?: string;
  description_snippet?: string;
  description?: string;
  job_type?: string;
  budget?: string;
  experience_level?: string;
  duration?: string;
  engagement?: string;
  proposals_tier?: string;
  proposal_count?: number;
  skills?: string[];
  client?: UpworkClient;
  job_activity?: { total_hired?: number; total_offered?: number; invited_to_interview?: number; invites_sent?: number };
  applied?: boolean;
  created_date?: string;
  published_date?: string;
};

export type SearchPage = {
  jobs: UpworkJob[];
  nextCursor?: string;
  hasMore: boolean;
  warnings: string[];
};

/** Reads one find_jobs response (the JSON in the first text content item). */
export function parseSearchResponse(result: { isError?: boolean; content?: unknown }): SearchPage {
  const content = Array.isArray(result.content) ? result.content : [];
  const text = content.find(
    (c): c is { type: "text"; text: string } =>
      !!c && typeof c === "object" && (c as { type?: unknown }).type === "text",
  )?.text;
  if (!text) throw new Error("Upwork returned no text content");

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text);
  } catch {
    // Errors are usually plain text.
    throw new Error(text.slice(0, 500));
  }
  if (result.isError || (body.status && body.status !== "ok")) {
    const msg = body.error ?? body.message ?? body.status ?? "unknown error";
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }

  const pageInfo = (body.pageInfo ?? {}) as { endCursor?: string; hasNextPage?: boolean };
  const warnings: string[] = [];
  for (const key of ["filters_ignored", "filters_rejected"] as const) {
    if (body[key]) warnings.push(`${key}: ${JSON.stringify(body[key])}`);
  }

  const jobs = (Array.isArray(body.jobs) ? body.jobs : []).filter(
    (j): j is UpworkJob => !!j && typeof j === "object" && typeof (j as UpworkJob).id === "string",
  );
  return {
    jobs,
    nextCursor: (body.next_cursor as string | undefined) ?? pageInfo.endCursor,
    hasMore: Boolean(body.hasMore ?? pageInfo.hasNextPage),
    warnings,
  };
}

/**
 * Parses Upwork's budget text: "3,500.00", "$50.00", "25.00–50.00/hr",
 * "up to 40.00/hr", "30.00+/hr". Returns undefined bounds when not stated.
 */
export function parseBudget(text: string | undefined): { min?: number; max?: number; hourly: boolean } {
  if (!text) return { hourly: false };
  const hourly = /\/\s*hr|hour/i.test(text);
  const nums = [...text.replace(/,/g, "").matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  if (nums.length === 0) return { hourly };
  if (nums.length >= 2) return { min: Math.min(nums[0], nums[1]), max: Math.max(nums[0], nums[1]), hourly };
  if (/up\s*to/i.test(text)) return { max: nums[0], hourly };
  if (/\+/.test(text)) return { min: nums[0], hourly };
  return { min: nums[0], max: nums[0], hourly };
}

/** "$22,151.41" → 22151.41, "$1.2K" → 1200, "$3M+" → 3000000. */
export function parseMoney(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const m = text.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*([kKmM])?/);
  if (!m) return undefined;
  const mult = m[2] ? (m[2].toLowerCase() === "k" ? 1_000 : 1_000_000) : 1;
  return Number(m[1]) * mult;
}

/** Upwork wraps client-written text in <untrusted_participant_content> tags. */
export function stripUntrustedTags(text: string | undefined): string {
  return (text ?? "").replace(/<\/?untrusted_participant_content>/g, "").trim();
}

export type Rules = {
  minHourlyRate?: number;
  minFixedBudget?: number;
  minClientSpend?: number;
  minClientRating?: number;
  requireVerifiedPayment: boolean;
  skipIfHired: boolean;
  excludeProposalTiers: string[];
  excludeKeywords: string[];
  excludeCountries: string[];
};

export const PROPOSAL_TIERS = ["Fewer than 5", "5 to 10", "10 to 15", "15 to 20", "20 to 50", "50+"];

export const DEFAULT_RULES: Rules = {
  requireVerifiedPayment: true,
  skipIfHired: true,
  excludeProposalTiers: ["50+"],
  excludeKeywords: [],
  excludeCountries: [],
};

/**
 * Local rules the Upwork search can't express exactly. Returns the first reason
 * a job is filtered out, or null when it passes.
 */
export function evaluateRules(job: UpworkJob, rules: Rules): string | null {
  const client = job.client ?? {};
  const budget = parseBudget(job.budget);
  const isHourly = job.job_type === "hourly" || budget.hourly;

  if (job.applied) return "Already applied";

  if (rules.requireVerifiedPayment && client.verification_status && client.verification_status !== "VERIFIED") {
    return "Client payment not verified";
  }

  if (rules.skipIfHired && (job.job_activity?.total_hired ?? 0) > 0) return "Client already hired for this job";

  if (isHourly && rules.minHourlyRate) {
    // The highest rate the client posted; a job with no stated maximum ("30+/hr")
    // is judged by its minimum.
    const top = budget.max ?? budget.min;
    if (top !== undefined && top < rules.minHourlyRate) return `Rate up to $${top}/hr is below $${rules.minHourlyRate}/hr`;
  }

  if (!isHourly && rules.minFixedBudget) {
    const top = budget.max ?? budget.min;
    if (top !== undefined && top < rules.minFixedBudget) return `Budget $${top} is below $${rules.minFixedBudget}`;
  }

  if (rules.minClientSpend) {
    const spent = parseMoney(client.total_spent) ?? 0;
    if (spent < rules.minClientSpend) return `Client spent $${Math.round(spent)} (< $${rules.minClientSpend})`;
  }

  if (rules.minClientRating && (client.total_reviews ?? 0) > 0 && client.rating !== undefined) {
    if (client.rating < rules.minClientRating) return `Client rating ${client.rating} is below ${rules.minClientRating}`;
  }

  if (job.proposals_tier && rules.excludeProposalTiers.includes(job.proposals_tier)) {
    return `Too many proposals (${job.proposals_tier})`;
  }

  if (client.country && rules.excludeCountries.some((c) => c.toLowerCase() === client.country!.toLowerCase())) {
    return `Client country excluded (${client.country})`;
  }

  const haystack = `${job.title}\n${job.description ?? job.description_snippet ?? ""}`.toLowerCase();
  const hit = rules.excludeKeywords.find((k) => k && haystack.includes(k.toLowerCase()));
  if (hit) return `Contains excluded keyword "${hit}"`;

  return null;
}

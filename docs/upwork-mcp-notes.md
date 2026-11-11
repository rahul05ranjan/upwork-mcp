# Upwork MCP: notes for this app

Collected from the live server's `tools/list` and `get_tool_help` on 2026-11-11.
Re-check with `get_tool_help(tool_name=...)` if behaviour seems to differ.

## Basics

- Endpoint: `https://mcp.upwork.com/mcp`. It uses Streamable HTTP and OAuth 2.1 with dynamic client registration, and a `localhost` redirect works.
- There are 36 tools, all with annotations. Write tools have `readOnlyHint: false` and `destructiveHint: true`, and the app's `isReadOnlyTool` guard relies on that.
- Almost every call needs an `org_uid`, which comes from `upwork__list_accounts`.

## Finding jobs: `upwork__find_jobs`

- `action: "search"` filters on `title` (1–3 words, ANDed), `query` (semantic, whole posting), `skills` (at most 5, ANDed, exact Upwork skill names), `job_type`, `experience_level`, `budget_min`/`budget_max` (fixed-price only), `rate_min`/`rate_max` (hourly ranges that overlap, not strict bounds), `proposals_min`/`proposals_max`, `client_hires_min`/`client_hires_max`, `verified_payment_only`, `location`, `timezone`, `category`, `subcategory`, `workload`, `duration` and `sort`.
  - `limit` goes up to **10**, and you page with `cursor`. `search` has **no date filter**.
  - `title` can't be combined with `query`, and `sort=relevance` is refused alongside title, skills or category filters.
  - Skill names that don't match are reported in `filters_ignored`, and unknown locations in `filters_rejected`. Show both to the user.
  - Each result includes `applied`. Never draft a proposal for a job the user already applied to.
- `action: "smart_search"` reads Upwork's own recommendation feed for the profile.
  - It has two modes: `best_match` and `most_recent`. Only `most_recent` honours dates (`days_posted`, `from_date`, `to_date`).
  - Don't pass skills to it.
- `action: "get"` returns full details: `connects_cost`, `connects_balance`, `can_apply`, `client_record` (hire rate, spend, feedback), `preferred_qualifications`, `client_feedback` and screening questions.
  - **Rate limit:** repeated 403s trigger a cooldown of about a minute (`JOB_BROWSE_COOLDOWN`). Call `get` only for jobs that pass the filters and scoring.

## Submitting proposals: `upwork__manage_proposals` + `upwork__confirm_preview`

The server enforces a two-step flow, which matches this app's approval rule:

1. `manage_proposals` `action: "create"` returns a **preview** and does not submit anything. The preview includes `connects_cost`, `connects_balance`, bid stats, a boost block, screening questions and `unmet_preferred_qualifications`.
2. `confirm_preview` with `{ type: "proposal", preview_id }` submits the proposal. Only the user's Approve click may trigger this.

Rules from Upwork's help text that the app must follow:

- **Before `create`:** call `list_freelancer_proposals` with `action=invitations` and with `action=list`.
  - If an invitation exists, use `accept_invitation` instead of `create`.
  - If a proposal already exists, Upwork rejects `create` (`VJ-JA-10`).
- `create` params:
  - `job_reference` is the **numeric** `jobs[].id`, not the `~02…` ciphertext.
  - `cover_letter` has a **5000 character maximum**. Never truncate it silently.
  - `charged_amount` must be a number.
  - Optional: `answers[]` for screening questions, `boost_connects`, `attachments`, `certificate_ids`, `portfolio_project_ids` and `work_history_ids`.
  - Fixed-price jobs also take `estimated_duration`, `payment_mode` and `milestones`.
- The approval screen must always show **`connects_cost` and `connects_balance`**.
- Ask about **attachments** before submitting. Uploading starts with `start_attachment_upload` using `context="proposals"`.
- Offer **highlights** from `get_profile` `action=list_highlights`, and attach only the ones the user picks.
- **Boost:** offer it only when `boost.available` is true.
  - The bid must be at least `recommended_connects` and at most `max_boost_connects`.
  - A submitted boost can't be changed afterwards.
- **Cover letter content:** base every claim on real history from `get_profile` and the user's Accepted or Hired proposals in `list_freelancer_proposals`. Never invent clients, metrics or praise.
  - Address the client by name only when a review in `client_feedback` names them.
  - If the job requires another language, include the letter in that language as well.

## Response format (seen live)

- Results come back as JSON in `content[0].text`, and `structuredContent` is not used.
  The page cursor is `next_cursor`, with `pageInfo.endCursor` as a second place to look.
- `list_accounts` returns `{ accounts: [{ org_uid, name, role, role_label }] }`.
  This login has both `TALENT` (Freelancer) and `FL_AGENCY` (Agency) accounts.
- `budget` is text: `"3,500.00"` or `"$50.00"` for fixed price, and `"25.00–50.00/hr"`, `"up to X/hr"` or `"X+/hr"` for hourly.
  `client.total_spent` is text too, like `"$22,151.41"`.
  `src/lib/feed/parse.ts` parses both.
- **Client-written text arrives wrapped in `<untrusted_participant_content>` tags.**
  In Phase 3, give job text to OpenAI as clearly marked data, never as instructions.
  Never let it trigger tool calls.

## Seen live while building Phase 4 (2026-11-11)

- With too few Connects, `manage_proposals create` returns a plain-text **error** and no preview, for example "You don't have enough Connects… It costs 16 Connects. Add Connects at: …". Upwork checks the balance before it builds a preview.
  - The app detects this case (`needsConnects`) and shows a buy-Connects link.
- `get_profile action=connects_balance` returns `balance.connectsBalance` (free plus paid) and `usage_history`.
- `list_freelancer_proposals action=invitations` accepts `job_posting_id` and returns `data.invitations[]` with `totalCount`.
- **Not yet seen:** the exact shape of a successful preview and of a `confirm_preview` response.
  - `src/lib/proposal-preview.ts` finds fields by name at any depth.
  - The UI also shows the full raw preview.
  - Recheck both against the first real preview.

## Other useful read tools

- `list_freelancer_proposals` lists proposals and their outcomes, which feeds Phase 5 and the drafting style examples.
- `get_profile` returns the profile, work history and highlights, which ground the drafts.
- `get_freelancer_dashboard` shows Connects and current activity.

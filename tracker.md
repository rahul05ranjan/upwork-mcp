# Project tracker

Last updated: **2026-11-12**.
Read this first when you pick the project up again.

## Where things stand

The local Next.js dashboard is connected to Upwork's official MCP server and does four things:

- finds jobs on a schedule
- scores each job with OpenAI
- drafts proposals grounded in the real profile
- submits a proposal only after you approve it

**Phases 1–4 are built.** The full submit path has **not run against Upwork yet** because the account has **0 Connects** (details below).

| Phase | What it does | State |
|---|---|---|
| 1. Connect | OAuth 2.1 to `https://mcp.upwork.com/mcp`, plus a tool explorer that blocks write tools | ✅ Done, verified live |
| 2. Feed | Saved searches and Upwork recommendations on a schedule, filter rules, SQLite | ✅ Done, verified live (40 jobs found, rules filtered 22) |
| 3. AI | Fit scores and grounded drafts, both `gpt-6-luna` since 2026-11-12 (were `gpt-5.4-mini` and `gpt-5.5`), with an editor and versions | ✅ Done, verified live |
| — | *Get Seen on Upwork 2026* guidance: Profile health page, rate vs budget, letter preview and checks, new draft prompt | ✅ Done, verified live |
| 4. Bid | Upwork preview, then Approve, screening answers, attachments, boost calculator, Connects limits, proposal log | ⚠️ Built. Refusals and guards verified live; **a real preview and submit are untested** |
| 5. Learn | Use the outcomes (viewed, replied, hired) to tune prompts | ⏳ Not started |

Code: https://github.com/rahul05ranjan/upwork-mcp (private, `main`).

## Tomorrow: do these in order

### 0. Reconnect and check the profile split (new on 2026-11-12)

Data is now stored per Upwork profile, so after the update the app shows only **Connect Upwork** until you log in.

1. Click **Connect Upwork** and log in.
2. Check that the old 41 jobs are back. They moved into `.data/profiles/851793402293047298.db`. `.data/app.db` is the untouched old copy; delete it once everything looks right.
3. Click **Run now**. The first run should add one search per profile skill (first 5: ExpressJS, Laravel, Node.js, Yii2, CodeIgniter) and set min hourly rate to $15. The run message says what it added.
4. On **Searches & rules**, check each new search for `filters_ignored` or `filters_rejected` warnings. `proposals_max: 20` has never been tried live. Delete the searches you don't want; they won't come back.
5. Click **Disconnect**. Every page should show only the connect screen.

### 1. Start the app

```bash
cd ~/Desktop/code/upwork-mcp
npm run dev          # http://localhost:3000
```

- The header should say **Connected · … (Freelancer)**. If it doesn't, click **Connect Upwork**.
- `.env.local` must contain `OPENAI_API_KEY=sk-...`, with the `OPENAI_API_KEY=` part included.

### 2. Rotate the OpenAI key (recommended)

- The key was printed in full in the Claude session on 2026-11-11, while debugging the `.env.local` format.
- It was never sent to an outside service. To be safe, create a new key on the OpenAI dashboard, delete the old one, update `.env.local`, then restart `npm run dev`.

### 3. Buy a few Connects

- The balance is 0. A typical job costs about 16 Connects to apply to, and Connects cost about $0.15 each.
- Buy them at https://www.upwork.com/nx/plans/connects/

### 4. First real submission, done together with Claude

Pick a **small job with few proposals** that fits well, then:

1. Shortlist it, open it, click **Write draft with AI**, edit the draft and save.
2. Click **Get Upwork preview**. Nothing is sent and no Connects are spent.
3. **Check with Claude before approving** (this preview format has never been seen):
   - Do these fields show correctly: Connects cost, balance, screening questions, boost block?
   - Open **Full preview from Upwork** (the raw JSON). Do the field names match `src/lib/proposal-preview.ts`? Fix the parser if they don't.
4. Answer the screening questions, choose the attachments option, tick the Connects box, and click **Approve & submit**.
5. Afterwards, check these:
   - The **Proposals** page shows the proposal.
   - **Refresh from Upwork** finds it, and sets its status and viewed flag.
   - The `confirm_preview` response gave a proposal id. Check this in the `result` column of the `submissions` table.
   - Write down the real response shapes in `docs/upwork-mcp-notes.md`.

### 5. Profile fixes

These matter more than any cover letter. The profile currently meets **2 of 7** of the book's page-one conditions, which puts page-one odds at about 0–14 in 100.

- [ ] Set the 3 manual checks on **Profile health**: completeness 100%, hire-again rate, response time.
- [ ] Employment history: go from 1 to **3 or more real entries**.
- [ ] Hourly rate: raise it from **$15** to **$20 or more**. About $19.75/hr is typical for jobs in the feed. The book says to do this once a recent job is won.
- [ ] Win a small, fast job soon. The last contract ended in **Feb 2023**.
- [ ] Portfolio: grow it from 4 items toward 15–20.
- [ ] Fix the title typo "Developement" → "Development". Put one service and one main tool first.
- [ ] Fill in **Searches & rules → AI writer**: About me, style, sign-off, and 1–3 proposals that won work.
- [ ] Add saved searches for your real skills. Only "Recommended for me (today)" exists right now.
- [ ] Don't boost until the profile meets 5 or more of the 7 conditions.

### 6. Fix git push (one-time)

- SSH push fails because this Mac's SSH key isn't on GitHub. The remote is set to HTTPS.
- Run **one** of these:
  - `gh auth setup-git`, so `git push` uses the gh login. This changes the global git config.
  - `gh ssh-key add ~/.ssh/id_ed25519.pub`, then `git remote set-url origin git@github.com:rahul05ranjan/upwork-mcp.git`.
- This file is not committed yet.

## Decisions (don't re-litigate)

- Use **Upwork's official MCP server**. Don't use community servers or browser automation.
- **Approve every bid by hand.** There is no auto-submit. The AI never gets tools, and the only call to `confirm_preview` is the Approve action.
- The app runs locally for now. It may later be self-hosted, which **needs an auth layer first** (see the backlog).
- Stack: Next.js 16 (App Router, Cache Components on), TypeScript, SQLite via `node:sqlite` (Node 24), and OpenAI only.
- Drafting follows *Get Seen on Upwork 2026*:
  - No greeting in the first ~230 characters.
  - A trap, plan or short structure.
  - About 170 words.
  - One closing question.
  - Never bid below the profile rate.

## Safety rules the code relies on

- `src/lib/upwork/proposals.ts` is the **only** module allowed to call Upwork write tools, and only through its allowlist:
  - `manage_proposals` create, accept_invitation, acknowledge_policy
  - `confirm_preview` for proposal types
  - `start_attachment_upload`
- `confirmSubmission` in `src/lib/submit.ts` checks all of these again on the server before submitting:
  - It's the latest preview for the job.
  - It's still in `previewed` status.
  - The Connects box was ticked and the attachments question was answered.
  - Every screening question has an answer.
  - The Connects limits and the balance allow it.
  - It atomically claims the row (`claimForSubmit`).
- The unique index `submissions_one_live` allows only one submitting or submitted row per job.
- If the outcome is unknown, for example after a network error during confirm, the row stays `submitting`. That blocks retries, and the user resolves it on the job page after checking Upwork.
- **Everything is per profile.** `db()` throws `NoProfile` when nobody is connected, and each page is wrapped in `<Gated>`. A feed run pins its profile with `withProfile()`, so switching accounts mid-run can't mix data. Approve sends the page's `org_uid`, and the action refuses it if another profile became active.
- The tool explorer (`/tools`, `/api/upwork/tools/call`) runs read-only tools only (`isReadOnlyTool`).
- Job posts, client reviews and profile text come wrapped in `<untrusted_participant_content>`. They reach the model only as data, through `untrusted()`.
- Secrets are never committed. `.env.local` and `.data/` (tokens and database) are gitignored. Scan the staged diff before pushing.

## Code map

| Area | Files |
|---|---|
| Upwork connection | `src/lib/upwork/client.ts`, `auth-provider.ts`, `src/app/api/upwork/*` |
| Write calls (allowlist) | `src/lib/upwork/proposals.ts` |
| Submit workflow | `src/lib/submit.ts`, `src/lib/submissions.ts`, `src/lib/proposal-preview.ts`, `src/lib/boost.ts` |
| Feed | `src/lib/feed/run.ts` (runner), `scheduler.ts`, `parse.ts` (budget parsing and rules), `jobs.ts`, `searches.ts`, `settings.ts`, `src/instrumentation.ts` |
| AI | `src/lib/ai/score.ts`, `draft.ts`, `answers.ts`, `letter-checks.ts`, `openai.ts`, `workflow.ts`; profile context in `src/lib/profile.ts` |
| Profile health | `src/lib/health.ts` (pure), `src/lib/health-data.ts` |
| Database | `src/lib/db.ts` (session DB, one DB per profile, migrations; profile schema version 3), `src/lib/store.ts` (profile and session key/value) |
| Profiles | `src/lib/session.ts` (active profile, account switch, legacy `app.db` import), `src/app/profile-gate.tsx` (`<Gated>` on every page), `src/lib/feed/profile-seed.ts` (searches and rules from the profile) |
| Pages | `/` jobs, `/jobs/[id]` detail, draft and submit, `/proposals` log, `/health`, `/settings`, `/tools` |
| Notes | `docs/upwork-mcp-notes.md` (Upwork tool facts and response shapes), `README.md` |

## Commands

```bash
npm run dev         # local app; the scheduler starts with it
npm test            # 27 unit tests (parsing, rules, health, letter checks, boost, preview parser)
npm run typecheck
npm run lint
npm run build
```

- Data lives in `.data/session.db` (kv: `upwork-auth`, `profile`) and `.data/profiles/<org_uid>.db` (tables: `kv`, `searches`, `jobs`, `job_sources`, `runs`, `job_scores`, `drafts`, `submissions`). Inspect them with `node:sqlite`.
- Adding a migration means appending to `PROFILE_MIGRATIONS` (or `SESSION_MIGRATIONS`) in `src/lib/db.ts`. It applies on the next DB access, even after a hot reload.
- **Testing pattern used so far:**
  - Read-only Node scripts against Upwork, using the stored token.
  - Throwaway `src/app/api/tmp-*` routes to call server code from the terminal. Delete them right after.
  - Never call `confirm_preview` from a test.

## Known gaps and backlog

- [ ] **The confirm response shape has never been seen.** The preview shape is now known (2026-11-12, see `docs/upwork-mcp-notes.md`). Verify confirm on the first real submission (step 4 above).
- [ ] Fixed-price **milestones** (`payment_mode=by_milestone` with a milestones list) aren't supported. Use "by project".
- [ ] Outcome matching in `refreshOutcomes` and `preCheck` looks for the job id inside proposal and invitation JSON. Switch to explicit fields once the real shapes are known.
- [ ] Replies are marked by hand on the Proposals page. They could come from `get_messages` or proposal status later.
- [ ] Phase 5: use viewed, replied and hired outcomes to rank which letter templates and openings work, and feed winning letters back as style samples.
- [ ] Optional boost ideas: suggest a bid automatically from `recommended_connects` and the calculator, and track placebo auctions in the log.
- [ ] Before any hosting: add a login, move the scheduler out of the web process if needed, and set `APP_URL`, then Disconnect so the OAuth client re-registers. Hosting for several users also needs the active profile per login, not one per server.
- [ ] `node:sqlite` prints an "experimental" warning, which is harmless.
- [ ] There are no automated tests for `submit.ts` and `submissions.ts` against a fake MCP client yet. They were verified by hand on 2026-11-11 (all refusals, plus double-submit protection).

## Session log

- **2026-11-12:**
  - Split storage per Upwork profile: `session.db` for login, `profiles/<org_uid>.db` for the rest. Disconnect now hides all data.
  - New profiles get their searches from their skills, and min hourly rate from their rate, on the first run.
  - Account switching moved to its own form on Searches & rules.
  - All AI (scores, drafts, screening answers) now uses `gpt-6-luna` by default.
  - Fit scores use a rubric: the model gives points for skills (40), pay (20), client (20), competition (10) and clarity (10); the code adds them up and sets the verdict. Cards show the breakdown. Rescored Rahul Arora's 59 jobs (26–69, none "strong"); the other profile still has old scores without a breakdown.
  - Upwork's skill `search` returned posts up to 3 years old (it has no date filter). Added a **max job age** rule (default 72 hours, re-checked every run) and made **Newest** the default sort. 41 of Rahul Arora's stored jobs dropped out as too old.
  - Fixed-price jobs: Upwork replies with `next_step` (no preview) until `estimated_duration` and `payment_mode` are sent. The form now requires both (duration pre-filled from the client's estimate, payment "By project"), and the server checks them before calling Upwork.
  - Imported the old `app.db` into profile 851793402293047298 (its `orgUid` had been cleared by Disconnect and was restored by hand first).

- **2026-11-11:**
  - Planned the project and built Phases 1–4.
  - Added the *Get Seen on Upwork 2026* guidance.
  - Fixed: profile title and overview arrived wrapped in untrusted tags; null-prototype SQLite rows broke client props; hydration mismatch from locale dates; migrations skipped after hot reload.
  - Pushed to the private GitHub repo.
  - Blocked on Connects (balance 0) for the first live submit.

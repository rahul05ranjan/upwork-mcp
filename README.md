# Job Dashboard

Finds Upwork jobs that match your skills, drafts cover letters with OpenAI models, and submits a proposal only after you approve it.
It talks to Upwork through Upwork's official MCP server, `https://mcp.upwork.com/mcp`, and you log in with OAuth 2.1.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 and click **Connect Upwork**. Then:

1. On **Searches & rules**, add saved searches:
   - Upwork's own recommendations for your profile, or
   - searches by title words, keywords or skills, with job type, rate and client filters.
2. Set the filter rules: minimum rate and budget, client spend and rating, verified payment, proposal count, and excluded keywords or countries.
   Jobs a rule filters out stay visible under **Filtered out**, with the reason.
3. Searches run on a schedule (every 30 minutes by default) and whenever you click **Run searches now** on **Jobs**.
4. Each run also has OpenAI score every job that passes the rules, from 0 to 100 with reasons and red flags.
   Sort by **Best fit** to see the top jobs first.
5. Shortlist a job and open it to see the full details: client record, client reviews, preferred qualifications and Connects cost.
   Click **Write draft with AI** to write a draft.
   - You can edit the draft, regenerate it with instructions such as "shorter", choose highlights to attach, and save.
   - Every version is kept.

## Submitting a proposal

Submitting happens on the job page, in two steps.

1. **Get Upwork preview.** This is free, and nothing is sent.
   - The app first runs Upwork's required checks. If you already have a proposal for the job, it stops. If you have an invitation, it uses `accept_invitation` instead of a new proposal.
   - It then sends your latest saved draft (letter, bid, highlights) and gets Upwork's preview: the Connects cost, your balance, screening questions, preferred qualifications you don't meet, and the boost auction.
2. **Approve & submit.**
   - Before Approve unlocks, you must answer every screening question (AI can draft them), choose whether to attach files (through Upwork's secure upload), and tick that you've seen the Connects cost.
   - The server checks everything again before calling `confirm_preview`. Your Connects limits (per proposal and per 24 hours, set in **Searches & rules**) also apply.
   - Changing anything after the preview means you have to update the preview first.
   - A job can be submitted only once. The database enforces this as well.

If you choose to boost, the boost calculator shows whether the bid pays: win rate × Upwork's "up to 24%" uplift × job profit, compared with Connects × $0.15. It also advises against boosting while your profile meets fewer than 5 of the 7 visibility conditions.

The only code that can call Upwork's write tools is `src/lib/upwork/proposals.ts`. It allows `manage_proposals` (create, accept_invitation, acknowledge_policy), `confirm_preview` for proposal types, and `start_attachment_upload`. Only the Approve action calls `confirm_preview`. The AI never gets any tools.

**Proposals** logs every proposal you send: the competition when you applied, your rate against the budget, and the Connects spent. **Refresh from Upwork** pulls whether each proposal was viewed and its status, and you mark replies yourself. Following *Get Seen on Upwork*, judge your view rate only after 20 or more proposals.

## Visibility guidance

Several features follow *Get Seen on Upwork 2026*, an independent buyer-side study of 4,536 proposals.
It is not Upwork's formula.

- **Profile health** checks your profile against the study's seven page-one conditions.
  - Earnings, rate against the typical rate in your feed, recent contracts and account type are checked automatically.
  - Completeness, hire-again rate and response time aren't available from the API, so you confirm those yourself.
  - The page shows your page-one odds, your hidden-folder risk and a fix list in order of impact.
- **Rate check:** every hourly job shows your profile rate against its posted budget.
  In the study, profile rates below the typical applicant's ranked much lower.
- **Drafts follow the study's advice on letters:**
  - No greeting in the first ~230 characters, which is all the client sees in their list.
  - A trap, plan or short structure.
  - About 170 words.
  - One piece of past work.
  - One closing question.

  The editor shows the client's list preview and these checks as you edit.

## AI setup

Put the OpenAI settings in `.env.local`:

```
OPENAI_API_KEY=sk-...
OPENAI_SCORING_MODEL=gpt-5.4-mini   # optional
OPENAI_DRAFT_MODEL=gpt-5.5          # optional
```

Drafts are grounded in your Upwork profile, highlights and past proposals, which are fetched read-only and cached for a day.
They also use the **AI writer** notes on **Searches & rules**.
The prompt forbids claims that don't appear in that data, and the model lists anything you should check before sending.
Job posts and client reviews are passed to the model as untrusted data, and the model has no tools.
The settings page shows the tokens used so far.

**Upwork tools** lists everything Upwork's server offers.
You can run the read-only tools from that page.
Tools that change anything on Upwork, such as submitting or messaging, are shown but blocked.

All data is in `.data/app.db` (SQLite through Node's built-in `node:sqlite`, which needs Node 24 or newer), and `.data/` is gitignored and readable only by you.
That includes the OAuth tokens.
**Disconnect** forgets the tokens.
To revoke access fully, also remove the app under Upwork → Settings → Connected Apps.

```bash
npm test          # parser and filter-rule tests
npm run typecheck
```

## Settings

| Variable | Default | Purpose |
|---|---|---|
| `APP_URL` | `http://localhost:3000` | Base URL used for the OAuth redirect (`/api/upwork/callback`) |
| `UPWORK_MCP_URL` | `https://mcp.upwork.com/mcp` | MCP server endpoint |

If you change `APP_URL`, for example when hosting it yourself, delete `.data/upwork-auth.json` so the app registers again with the new redirect URI.
Before hosting it anywhere other than localhost, put the app behind a login.
Until then, anyone who can reach the server can use your Upwork session.

## Roadmap

1. **Connect**: OAuth with Upwork MCP and a tool explorer *(done)*
2. **Feed**: saved skills and filters, scheduled search, job list *(done)*
3. **AI**: OpenAI fit scoring and cover letter drafts, with an editor *(done)*
4. **Bid**: an Approve button submits the proposal, with a Connects budget guard and a bid log *(built; the full submit path still needs a live test once the account has Connects)*
5. **Learn**: outcome tracking and prompt tuning from proposals that won

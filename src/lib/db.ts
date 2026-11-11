import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// One local SQLite file (.data/app.db, gitignored). node:sqlite is synchronous,
// which is fine for a single-user local app; pages that read it call
// connection() first so Next.js treats the data as per-request.

const DATA_DIR = path.join(process.cwd(), ".data");

const MIGRATIONS: string[] = [
  `
  CREATE TABLE kv (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- A saved job search. kind=search runs find_jobs action=search with params;
  -- kind=smart reads Upwork's own recommendations (action=smart_search).
  CREATE TABLE searches (
    id           INTEGER PRIMARY KEY,
    name         TEXT NOT NULL,
    kind         TEXT NOT NULL CHECK (kind IN ('search', 'smart')),
    params       TEXT NOT NULL,
    enabled      INTEGER NOT NULL DEFAULT 1,
    last_run_at  TEXT,
    last_status  TEXT,
    last_message TEXT,
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE jobs (
    id               TEXT PRIMARY KEY,   -- numeric Upwork job id (job_reference for proposals)
    title            TEXT NOT NULL,
    url              TEXT,
    snippet          TEXT,
    job_type         TEXT,
    budget_text      TEXT,
    budget_min       REAL,
    budget_max       REAL,
    experience_level TEXT,
    duration         TEXT,
    engagement       TEXT,
    proposals_tier   TEXT,
    skills           TEXT NOT NULL DEFAULT '[]',
    client           TEXT NOT NULL DEFAULT '{}',
    job_activity     TEXT NOT NULL DEFAULT '{}',
    applied          INTEGER NOT NULL DEFAULT 0,
    created_date     TEXT,
    published_date   TEXT,
    status           TEXT NOT NULL DEFAULT 'new'
                     CHECK (status IN ('new', 'shortlisted', 'skipped', 'applied')),
    rule_reject      TEXT,               -- why local rules filtered it out; NULL = passes
    first_seen_at    TEXT NOT NULL,
    last_seen_at     TEXT NOT NULL,
    raw              TEXT NOT NULL
  );
  CREATE INDEX jobs_status ON jobs (status, published_date DESC);

  CREATE TABLE job_sources (
    job_id    TEXT NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
    search_id INTEGER NOT NULL REFERENCES searches (id) ON DELETE CASCADE,
    PRIMARY KEY (job_id, search_id)
  );

  CREATE TABLE runs (
    id          INTEGER PRIMARY KEY,
    trigger     TEXT NOT NULL,
    started_at  TEXT NOT NULL,
    finished_at TEXT,
    found       INTEGER NOT NULL DEFAULT 0,
    new_jobs    INTEGER NOT NULL DEFAULT 0,
    messages    TEXT NOT NULL DEFAULT '[]'
  );
  `,
  `
  -- Full find_jobs action=get response, fetched only for jobs being drafted.
  ALTER TABLE jobs ADD COLUMN details TEXT;
  ALTER TABLE jobs ADD COLUMN details_fetched_at TEXT;

  CREATE TABLE job_scores (
    job_id        TEXT PRIMARY KEY REFERENCES jobs (id) ON DELETE CASCADE,
    score         INTEGER NOT NULL,
    verdict       TEXT NOT NULL,
    summary       TEXT NOT NULL,
    reasons       TEXT NOT NULL,
    red_flags     TEXT NOT NULL,
    model         TEXT NOT NULL,
    input_tokens  INTEGER,
    output_tokens INTEGER,
    created_at    TEXT NOT NULL
  );

  -- Every AI draft and every user edit is a new version; the newest is current.
  CREATE TABLE drafts (
    id            INTEGER PRIMARY KEY,
    job_id        TEXT NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
    version       INTEGER NOT NULL,
    source        TEXT NOT NULL CHECK (source IN ('ai', 'user')),
    cover_letter  TEXT NOT NULL,
    bid_amount    REAL,
    bid_rationale TEXT,
    highlights    TEXT NOT NULL DEFAULT '{}',
    notes         TEXT NOT NULL DEFAULT '[]',
    instructions  TEXT,
    model         TEXT,
    input_tokens  INTEGER,
    output_tokens INTEGER,
    created_at    TEXT NOT NULL,
    UNIQUE (job_id, version)
  );
  `,
  `
  -- One row per Upwork preview. Only the user's Approve click moves a row to
  -- 'submitting' and then 'submitted'; nothing else calls confirm_preview.
  CREATE TABLE submissions (
    id                 INTEGER PRIMARY KEY,
    job_id             TEXT NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
    draft_id           INTEGER REFERENCES drafts (id) ON DELETE SET NULL,
    kind               TEXT NOT NULL CHECK (kind IN ('proposal', 'proposal_accept_invitation')),
    invitation_uid     TEXT,
    params             TEXT NOT NULL,      -- exactly what was sent to create / accept_invitation
    preview_id         TEXT,
    preview            TEXT,               -- the preview as Upwork returned it
    connects_cost      INTEGER,
    boost_connects     INTEGER,
    status             TEXT NOT NULL CHECK (status IN ('previewed', 'submitting', 'submitted', 'failed', 'superseded')),
    error              TEXT,
    result             TEXT,
    proposal_id        TEXT,
    proposals_tier     TEXT,               -- competition when applying, for the log
    rate_ratio         REAL,               -- profile rate / posted budget, for the log
    viewed             INTEGER,
    replied            INTEGER,
    upwork_status      TEXT,
    outcome_checked_at TEXT,
    created_at         TEXT NOT NULL,
    submitted_at       TEXT
  );
  CREATE INDEX submissions_job ON submissions (job_id, id DESC);
  -- At most one submission per job can be in flight or sent: blocks double submits.
  CREATE UNIQUE INDEX submissions_one_live ON submissions (job_id) WHERE status IN ('submitting', 'submitted');
  `,
];

function open(): DatabaseSync {
  mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path.join(DATA_DIR, "app.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  return db;
}

function migrate(db: DatabaseSync): void {
  const { user_version: version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}

// The connection survives dev-server hot reloads; the migration count is
// tracked with it so a reload that adds a migration still applies it.
const g = globalThis as unknown as { __appDb?: DatabaseSync; __appDbMigrations?: number };
export function db(): DatabaseSync {
  const conn = (g.__appDb ??= open());
  if (g.__appDbMigrations !== MIGRATIONS.length) {
    migrate(conn);
    g.__appDbMigrations = MIGRATIONS.length;
  }
  return conn;
}

export function transaction<T>(fn: () => T): T {
  const d = db();
  d.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    d.exec("COMMIT");
    return result;
  } catch (err) {
    d.exec("ROLLBACK");
    throw err;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

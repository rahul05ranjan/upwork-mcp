import "server-only";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";

// Small key/value store on top of SQLite, for single JSON blobs such as the
// OAuth state and app settings.

export function kvGet<T>(key: string): T | undefined {
  migrateLegacyFile(key);
  const row = db().prepare("SELECT value FROM kv WHERE key = ?").get(key) as { value: string } | undefined;
  return row ? (JSON.parse(row.value) as T) : undefined;
}

export function kvSet(key: string, value: unknown): void {
  db()
    .prepare("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
    .run(key, JSON.stringify(value));
}

// Phase 1 kept OAuth state in .data/<key>.json. Move it into the database once
// so the user stays logged in, then remove the file so tokens live in one place.
const migrated = new Set<string>();
function migrateLegacyFile(key: string) {
  if (migrated.has(key)) return;
  migrated.add(key);
  const file = path.join(process.cwd(), ".data", `${key}.json`);
  if (!existsSync(file)) return;
  const exists = db().prepare("SELECT 1 FROM kv WHERE key = ?").get(key);
  if (!exists) kvSet(key, JSON.parse(readFileSync(file, "utf8")));
  unlinkSync(file);
}

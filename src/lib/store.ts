import "server-only";
import type { DatabaseSync } from "node:sqlite";
import { db, sessionDb } from "@/lib/db";

// Small key/value stores for single JSON blobs.
//   kvGet / kvSet            the active profile's data (settings, profile context…)
//   sessionGet / sessionSet  login state shared by all profiles (OAuth, active profile)

function get<T>(conn: DatabaseSync, key: string): T | undefined {
  const row = conn.prepare("SELECT value FROM kv WHERE key = ?").get(key) as { value: string } | undefined;
  return row ? (JSON.parse(row.value) as T) : undefined;
}

function set(conn: DatabaseSync, key: string, value: unknown): void {
  conn
    .prepare("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
    .run(key, JSON.stringify(value));
}

export function kvGet<T>(key: string): T | undefined {
  return get<T>(db(), key);
}

export function kvSet(key: string, value: unknown): void {
  set(db(), key, value);
}

export function sessionGet<T>(key: string): T | undefined {
  return get<T>(sessionDb(), key);
}

export function sessionSet(key: string, value: unknown): void {
  set(sessionDb(), key, value);
}

export function sessionDelete(key: string): void {
  sessionDb().prepare("DELETE FROM kv WHERE key = ?").run(key);
}

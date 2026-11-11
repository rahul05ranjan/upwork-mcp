import "server-only";
import { NextResponse } from "next/server";
import { appUrl } from "@/lib/config";

/**
 * Rejects state-changing requests that don't come from this app's own pages,
 * so another site open in the browser can't drive the local dashboard.
 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  return origin !== null && origin === new URL(appUrl()).origin;
}

export function redirectHome(params?: Record<string, string>) {
  const url = new URL("/", appUrl());
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
  return NextResponse.redirect(url, 303);
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

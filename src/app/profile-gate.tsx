import { Suspense, type ReactNode } from "react";
import { connection } from "next/server";
import { hasTokens } from "@/lib/upwork/auth-provider";
import { activeProfile } from "@/lib/session";
import { LoginError } from "./login-error";

// All data belongs to an Upwork profile. Until someone connects, a page shows
// only the way to connect: no jobs, drafts or settings from an earlier login.
//
// Each page wraps itself in <Gated>; a gate in the root layout is not enough,
// because Next.js renders pages alongside layouts, not inside their checks.
// The data layer (db()) also refuses to read without a profile.

async function ProfileGate({ children }: { children: ReactNode }) {
  await connection();
  if ((await hasTokens()) && activeProfile()) return children;

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-16 text-center sm:px-6">
      <LoginError />
      <h1 className="text-2xl font-semibold tracking-tight">Connect your Upwork profile</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Jobs, searches, drafts and settings are kept per Upwork profile. Connect to see yours; the searches are set up from
        your profile&apos;s skills on the first run.
      </p>
      <form action="/api/upwork/connect" method="post" className="mt-6">
        <button className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
          Connect Upwork
        </button>
      </form>
    </main>
  );
}

export function Gated({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <ProfileGate>{children}</ProfileGate>
    </Suspense>
  );
}

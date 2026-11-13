import { connection } from "next/server";
import { hasTokens } from "@/lib/upwork/auth-provider";
import { activeProfile } from "@/lib/session";

export async function ConnectionBar() {
  await connection();
  const profile = (await hasTokens()) ? activeProfile() : undefined;

  return (
    <div className="flex items-center gap-3 text-sm">
      <span
        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
          profile
            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
            : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
        }`}
        title={profile?.label}
      >
        {profile ? `Connected · ${profile.label}` : "Not connected"}
      </span>
      {profile ? (
        <form action="/api/upwork/disconnect" method="post">
          <button className="text-xs text-zinc-500 underline-offset-2 hover:underline">Disconnect</button>
        </form>
      ) : (
        <form action="/api/upwork/connect" method="post">
          <button className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
            Connect Upwork
          </button>
        </form>
      )}
    </div>
  );
}

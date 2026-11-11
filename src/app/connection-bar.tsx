import { connection } from "next/server";
import { hasTokens } from "@/lib/upwork/auth-provider";
import { getSettings } from "@/lib/feed/settings";

export async function ConnectionBar() {
  await connection();
  const connected = await hasTokens();
  const { orgLabel } = getSettings();

  return (
    <div className="flex items-center gap-3 text-sm">
      <span
        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
          connected
            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
            : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
        }`}
        title={orgLabel}
      >
        {connected ? `Connected${orgLabel ? ` · ${orgLabel}` : ""}` : "Not connected"}
      </span>
      {connected ? (
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

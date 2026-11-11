import { disconnect } from "@/lib/upwork/auth-provider";
import { saveSettings } from "@/lib/feed/settings";
import { isSameOrigin, redirectHome } from "@/lib/http";

// Forgets local tokens and the chosen account (the next login may be a
// different Upwork user). To fully revoke, also remove the app under
// Upwork → Settings → Connected Apps.
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return new Response("Forbidden", { status: 403 });
  await disconnect();
  saveSettings({ orgUid: undefined, orgLabel: undefined });
  return redirectHome();
}

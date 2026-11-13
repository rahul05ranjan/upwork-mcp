import { disconnect } from "@/lib/upwork/auth-provider";
import { isSameOrigin, redirectHome } from "@/lib/http";

// Forgets local tokens and the active profile, so no profile's jobs are shown
// until someone logs in again (the next login may be a different Upwork user).
// To fully revoke, also remove the app under Upwork → Settings → Connected Apps.
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return new Response("Forbidden", { status: 403 });
  await disconnect();
  return redirectHome();
}

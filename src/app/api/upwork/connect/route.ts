import { NextResponse } from "next/server";
import { NeedsLogin, withUpwork } from "@/lib/upwork/client";
import { activeProfile, selectProfileAfterLogin } from "@/lib/session";
import { errorMessage, isSameOrigin, redirectHome } from "@/lib/http";

// Starts the Upwork login. If saved tokens still work, it only makes sure a
// profile is selected and returns home.
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return new Response("Forbidden", { status: 403 });
  try {
    await withUpwork(async (client) => {
      if (!activeProfile()) await selectProfileAfterLogin(client);
    });
    return redirectHome();
  } catch (err) {
    if (err instanceof NeedsLogin) return NextResponse.redirect(err.authorizationUrl, 303);
    return redirectHome({ error: `Could not reach Upwork MCP: ${errorMessage(err)}` });
  }
}

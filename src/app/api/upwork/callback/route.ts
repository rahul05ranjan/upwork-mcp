import type { NextRequest } from "next/server";
import { consumeOAuthState } from "@/lib/upwork/auth-provider";
import { finishLogin } from "@/lib/upwork/client";
import { errorMessage, redirectHome } from "@/lib/http";

// Upwork redirects the browser here after the user approves access.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;

  const denied = params.get("error");
  if (denied) {
    return redirectHome({ error: `Upwork login failed: ${params.get("error_description") ?? denied}` });
  }

  if (!(await consumeOAuthState(params.get("state")))) {
    return redirectHome({ error: "Login state did not match. Please try connecting again." });
  }

  const code = params.get("code");
  if (!code) return redirectHome({ error: "Upwork did not return an authorization code." });

  try {
    await finishLogin(code);
    return redirectHome({ connected: "1" });
  } catch (err) {
    return redirectHome({ error: `Could not finish Upwork login: ${errorMessage(err)}` });
  }
}

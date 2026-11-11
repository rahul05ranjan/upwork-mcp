import { isReadOnlyTool, listAllTools, NeedsLogin, withUpwork } from "@/lib/upwork/client";
import { errorMessage, isSameOrigin } from "@/lib/http";

type Body = { name?: unknown; args?: unknown };

// Runs one READ-ONLY Upwork tool for the explorer. Write tools (submit,
// message, ...) are refused here; they get their own approval flow later.
export async function POST(req: Request) {
  if (!isSameOrigin(req) || !req.headers.get("content-type")?.includes("application/json")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const name = typeof body.name === "string" ? body.name : "";
  const args =
    body.args && typeof body.args === "object" && !Array.isArray(body.args)
      ? (body.args as Record<string, unknown>)
      : {};

  try {
    const result = await withUpwork(async (client) => {
      const tool = (await listAllTools(client)).find((t) => t.name === name);
      if (!tool) return { status: 404, json: { error: `Unknown tool: ${name}` } };
      if (!isReadOnlyTool(tool)) {
        return { status: 403, json: { error: `"${name}" changes data on Upwork and is blocked in the explorer.` } };
      }
      return { status: 200, json: await client.callTool({ name, arguments: args }) };
    });
    return Response.json(result.json, { status: result.status });
  } catch (err) {
    if (err instanceof NeedsLogin) {
      return Response.json({ error: "Upwork session expired. Reconnect from the dashboard." }, { status: 401 });
    }
    return Response.json({ error: errorMessage(err) }, { status: 502 });
  }
}

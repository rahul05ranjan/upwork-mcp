import "server-only";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { UPWORK_MCP_URL } from "@/lib/config";
import { UpworkAuthProvider } from "./auth-provider";

/** Thrown when the user must log in to Upwork in the browser first. */
export class NeedsLogin extends Error {
  constructor(public readonly authorizationUrl: URL) {
    super("Upwork login required");
  }
}

function makeTransport(provider: UpworkAuthProvider) {
  return new StreamableHTTPClientTransport(new URL(UPWORK_MCP_URL), {
    authProvider: provider,
  });
}

async function connect(): Promise<Client> {
  const provider = new UpworkAuthProvider();
  const client = new Client({ name: "job-dashboard", version: "0.1.0" });
  try {
    await client.connect(makeTransport(provider));
    return client;
  } catch (err) {
    if (err instanceof UnauthorizedError && provider.authorizationUrl) {
      throw new NeedsLogin(provider.authorizationUrl);
    }
    throw err;
  }
}

/** Opens a session with Upwork's MCP server, runs `fn`, and always closes it. */
export async function withUpwork<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = await connect();
  try {
    return await fn(client);
  } finally {
    await client.close().catch(() => {});
  }
}

/** Completes the OAuth flow with the code Upwork sent to our callback. */
export async function finishLogin(code: string): Promise<void> {
  await makeTransport(new UpworkAuthProvider()).finishAuth(code);
}

export async function listAllTools(client: Client): Promise<Tool[]> {
  const tools: Tool[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.listTools(cursor ? { cursor } : undefined);
    tools.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor);
  return tools;
}

// Words that mark a tool as one that changes something on Upwork (spends
// Connects, sends a message, submits a proposal...). Matched per word of the
// tool name, so "get_recommended_jobs" is not caught by "end".
const WRITE_WORDS = new Set([
  "submit", "apply", "send", "create", "update", "edit", "delete", "remove",
  "withdraw", "accept", "decline", "reject", "hire", "pay", "release", "end",
  "close", "message", "reply", "invite", "offer", "post", "approve", "set",
  "save", "archive", "boost", "bid", "propose", "start", "pause", "terminate",
]);

function nameWords(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

/**
 * Conservative guard: a tool counts as read-only only if the server doesn't
 * mark it as writing AND its name has no write verb. Anything else must go
 * through the explicit, human-approved submit path (Phase 4), never the
 * explorer and never the model.
 */
export function isReadOnlyTool(tool: Tool): boolean {
  const a = tool.annotations;
  if (a?.readOnlyHint === false || a?.destructiveHint === true) return false;
  return !nameWords(tool.name).some((w) => WRITE_WORDS.has(w));
}

import "server-only";

export const UPWORK_MCP_URL = process.env.UPWORK_MCP_URL ?? "https://mcp.upwork.com/mcp";

/** Public base URL of this app; the OAuth redirect URI is built from it. */
export function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

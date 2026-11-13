import "server-only";
import { randomBytes } from "node:crypto";
import type {
  OAuthClientProvider,
  OAuthDiscoveryState,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { sessionGet, sessionSet } from "@/lib/store";
import { clearActiveProfile } from "@/lib/session";
import { appUrl } from "@/lib/config";

// Login state lives in the session store, outside any profile's data.
const STORE = "upwork-auth";

// Kept async so the provider's shape doesn't depend on the storage backend.
async function readJson<T>(key: string): Promise<T | undefined> {
  return sessionGet<T>(key);
}
async function writeJson(key: string, value: unknown): Promise<void> {
  sessionSet(key, value);
}

type AuthState = {
  client?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  codeVerifier?: string;
  oauthState?: string;
  discovery?: OAuthDiscoveryState;
};

async function load(): Promise<AuthState> {
  return (await readJson<AuthState>(STORE)) ?? {};
}

async function patch(update: Partial<AuthState>): Promise<void> {
  await writeJson(STORE, { ...(await load()), ...update });
}

export const CALLBACK_PATH = "/api/upwork/callback";

/**
 * OAuth 2.1 client for Upwork's MCP server, persisted to the local store.
 *
 * The SDK drives the flow (discovery, dynamic client registration, PKCE,
 * refresh). When the user has to log in, it calls redirectToAuthorization();
 * we keep that URL so the route handler can send the browser there.
 */
export class UpworkAuthProvider implements OAuthClientProvider {
  authorizationUrl?: URL;

  get redirectUrl() {
    return new URL(CALLBACK_PATH, appUrl()).toString();
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "Job Dashboard (local)",
      redirect_uris: [this.redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }

  async state() {
    const oauthState = randomBytes(24).toString("base64url");
    await patch({ oauthState });
    return oauthState;
  }

  async clientInformation() {
    return (await load()).client;
  }

  async saveClientInformation(client: OAuthClientInformationMixed) {
    await patch({ client });
  }

  async tokens() {
    return (await load()).tokens;
  }

  async saveTokens(tokens: OAuthTokens) {
    await patch({ tokens });
  }

  redirectToAuthorization(url: URL) {
    this.authorizationUrl = url;
  }

  async saveCodeVerifier(codeVerifier: string) {
    await patch({ codeVerifier });
  }

  async codeVerifier() {
    const { codeVerifier } = await load();
    if (!codeVerifier) throw new Error("No PKCE code verifier saved; restart the login.");
    return codeVerifier;
  }

  async saveDiscoveryState(discovery: OAuthDiscoveryState) {
    await patch({ discovery });
  }

  async discoveryState() {
    return (await load()).discovery;
  }

  async invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery") {
    if (scope === "all") return writeJson(STORE, {});
    const key = ({ client: "client", tokens: "tokens", verifier: "codeVerifier", discovery: "discovery" } as const)[scope];
    await patch({ [key]: undefined });
  }
}

/** Checks the `state` returned to the callback, then clears it (single use). */
export async function consumeOAuthState(received: string | null): Promise<boolean> {
  const { oauthState } = await load();
  await patch({ oauthState: undefined });
  return Boolean(oauthState && received && oauthState === received);
}

export async function hasTokens(): Promise<boolean> {
  return Boolean((await load()).tokens?.access_token);
}

/** Forgets the tokens and the active profile; the profile's data stays on disk for its next login. */
export async function disconnect(): Promise<void> {
  await writeJson(STORE, {});
  clearActiveProfile();
}

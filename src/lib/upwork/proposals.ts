import "server-only";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { isErrorReply } from "@/lib/proposal-preview";

// The ONLY module allowed to call Upwork tools that change anything, and only
// these actions. confirmPreview is called from exactly one place: the
// user's Approve action (lib/submit.ts). The AI never gets any tool.

const ALLOWED: Record<string, readonly string[]> = {
  upwork__manage_proposals: ["create", "accept_invitation", "acknowledge_policy"],
  upwork__confirm_preview: ["confirm"],
  upwork__start_attachment_upload: ["upload"],
};
const CONFIRM_TYPES = new Set(["proposal", "proposal_accept_invitation"]);

export type ToolReply = { isError: boolean; body?: Record<string, unknown>; text: string };

async function callWrite(client: Client, name: string, action: string, orgUid: string, params?: Record<string, unknown>): Promise<ToolReply> {
  if (!ALLOWED[name]?.includes(action)) throw new Error(`Blocked: ${name} ${action} is not an allowed write.`);
  return reply(await client.callTool({ name, arguments: { action, org_uid: orgUid, ...(params ? { params } : {}) } }));
}

export async function callRead(client: Client, name: string, action: string, orgUid: string, params?: Record<string, unknown>) {
  if (name in ALLOWED) throw new Error(`${name} is a write tool`);
  return reply(await client.callTool({ name, arguments: { action, org_uid: orgUid, ...(params ? { params } : {}) } }));
}

function reply(result: unknown): ToolReply {
  const r = result as { isError?: boolean; content?: unknown };
  const content = Array.isArray(r.content) ? r.content : [];
  const text = (content.find((c) => (c as { type?: string })?.type === "text") as { text?: string } | undefined)?.text ?? "";
  let body: Record<string, unknown> | undefined;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") body = parsed;
  } catch {
    // plain-text reply (Upwork uses these for errors)
  }
  return { isError: isErrorReply(r.isError, body), body, text };
}

export type CreateParams = {
  job_reference?: string;
  invitation_uid?: string;
  cover_letter: string;
  charged_amount?: number; // create
  bid?: number; // accept_invitation
  answers?: { question: string; answer: string }[];
  boost_connects?: number;
  attachments?: string[];
  certificate_ids?: string[];
  portfolio_project_ids?: string[];
  work_history_ids?: string[];
  application_method?: "cover_letter" | "ai_interview";
  estimated_duration?: string;
  payment_mode?: "by_project" | "by_milestone";
};

/** Asks Upwork for a preview. Nothing is submitted and no Connects are spent. */
export function requestPreview(client: Client, orgUid: string, kind: "proposal" | "proposal_accept_invitation", params: CreateParams) {
  const action = kind === "proposal" ? "create" : "accept_invitation";
  return callWrite(client, "upwork__manage_proposals", action, orgUid, stripEmpty(params));
}

/** Submits a stored preview. Spends Connects. Only for the user's Approve click. */
export function confirmPreview(client: Client, orgUid: string, type: string, previewId: string) {
  if (!CONFIRM_TYPES.has(type)) throw new Error(`Blocked: confirm type ${type}`);
  return callWrite(client, "upwork__confirm_preview", "confirm", orgUid, { type, preview_id: previewId });
}

/** Only after the user has read Upwork's policy message and clicked to accept it. */
export function acknowledgePolicy(client: Client, orgUid: string) {
  return callWrite(client, "upwork__manage_proposals", "acknowledge_policy", orgUid);
}

export function startProposalUpload(client: Client, orgUid: string, reason: string) {
  return callWrite(client, "upwork__start_attachment_upload", "upload", orgUid, { context: "proposals", reason });
}

function stripEmpty(o: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)),
  );
}

import { connection } from "next/server";
import { UpworkAuthProvider, clientMetadataUrl } from "@/lib/upwork/auth-provider";

// Client ID Metadata Document: Upwork fetches this URL (which is also our
// client_id) to learn the app's name and allowed redirect URIs.
export async function GET() {
  await connection(); // read APP_URL at request time, not at build time
  const clientId = clientMetadataUrl();
  if (!clientId) return new Response("Not found", { status: 404 });
  return Response.json({ client_id: clientId, ...new UpworkAuthProvider().clientMetadata });
}

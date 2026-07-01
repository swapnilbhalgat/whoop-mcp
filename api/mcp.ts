import { createMcpHandler } from "@vercel/mcp-adapter";
import { config } from "../src/config.js";
import { registerTools } from "../src/mcp/server.js";
import { createTokenStore } from "../src/store/index.js";
import { WhoopClient } from "../src/whoop/client.js";

/**
 * Vercel serverless entrypoint (route: POST /api/mcp).
 *
 * This is the serverless twin of src/bin/http.ts. It relies on STORAGE=redis
 * (Upstash) because a function's filesystem is ephemeral — the rotating WHOOP
 * refresh token must live in shared, durable storage. Set these env vars in
 * the Vercel project:
 *   WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET, WHOOP_REDIRECT_URI,
 *   STORAGE=redis, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN,
 *   MCP_BEARER_KEY
 *
 * If you prefer an always-on container instead, deploy src/bin/http.ts and
 * ignore this file.
 */
config.requireWhoop();
const whoop = new WhoopClient(createTokenStore());

const mcpHandler = createMcpHandler(
  (server) => registerTools(server, whoop),
  {},
  { basePath: "/api", verboseLogs: false, maxDuration: 60 },
);

/** Bearer gate: only callers with our MCP key (i.e. Claude) get through. */
export default function handler(req: Request): Response | Promise<Response> {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${config.http.bearerKey}`;
  if (!config.http.bearerKey || auth.length !== expected.length || auth !== expected) {
    return new Response(
      JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  }
  return mcpHandler(req);
}

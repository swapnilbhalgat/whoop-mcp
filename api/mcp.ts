import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { config } from "../src/config.js";
import { buildServer } from "../src/mcp/server.js";
import { createTokenStore } from "../src/store/index.js";
import { WhoopClient } from "../src/whoop/client.js";

/**
 * Vercel serverless entrypoint (route: POST /api/mcp).
 *
 * The serverless twin of src/bin/http.ts, using Vercel's Node request/response
 * signature (Vercel's Node runtime invokes handlers with (req, res), not the
 * Web Fetch `Request`). Stateless: a fresh server + transport per request.
 *
 * Requires STORAGE=redis (Upstash) because a function's filesystem is ephemeral
 * — the rotating WHOOP refresh token must live in shared, durable storage. Set:
 *   WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET, WHOOP_REDIRECT_URI,
 *   STORAGE=redis, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN,
 *   MCP_BEARER_KEY
 */
config.requireWhoop();
const whoop = new WhoopClient(createTokenStore());

// Vercel's Node request carries the parsed JSON body on `.body`.
type VercelRequest = IncomingMessage & { body?: unknown };

function authorized(req: IncomingMessage): boolean {
  const header = req.headers.authorization ?? "";
  const expected = `Bearer ${config.http.bearerKey}`;
  return Boolean(config.http.bearerKey) && header.length === expected.length && header === expected;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

export default async function handler(req: VercelRequest, res: ServerResponse): Promise<void> {
  if (req.method !== "POST") {
    json(res, 405, { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed (stateless server)" }, id: null });
    return;
  }
  if (!authorized(req)) {
    json(res, 401, { jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null });
    return;
  }

  const server = buildServer(whoop);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    transport.close();
    server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error(`[${randomUUID().slice(0, 8)}] request failed:`, err);
    if (!res.headersSent) {
      json(res, 500, { jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
    }
  }
}

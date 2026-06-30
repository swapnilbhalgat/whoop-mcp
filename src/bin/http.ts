import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { type Request } from "express";
import { config } from "../config.js";
import { buildServer } from "../mcp/server.js";
import { createTokenStore } from "../store/index.js";
import { WhoopClient } from "../whoop/client.js";

/**
 * Remote HTTP transport — deploy to any always-on Node host (Railway/Render/Fly)
 * or run locally to test the remote path. Gated by a bearer key so only Claude
 * (configured with the same key) can reach your WHOOP data.
 *
 * Runs in stateless mode: a fresh server+transport per request. Perfect for a
 * single-user MCP and the simplest thing to host.
 */
config.requireWhoop();
if (!config.http.bearerKey) {
  throw new Error("MCP_BEARER_KEY is required for the HTTP server (gates Claude -> your server).");
}

const whoop = new WhoopClient(createTokenStore());
const app = express();
app.use(express.json());

function authorized(req: Request): boolean {
  const header = req.headers.authorization ?? "";
  const expected = `Bearer ${config.http.bearerKey}`;
  return header.length === expected.length && header === expected;
}

const methodNotAllowed = {
  jsonrpc: "2.0" as const,
  error: { code: -32000, message: "Method not allowed (stateless server)" },
  id: null,
};

app.post("/mcp", async (req, res) => {
  if (!authorized(req)) {
    res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null });
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
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
    }
  }
});

// Stateless mode has no server-initiated streams / sessions to tear down.
app.get("/mcp", (_req, res) => res.status(405).json(methodNotAllowed));
app.delete("/mcp", (_req, res) => res.status(405).json(methodNotAllowed));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(config.http.port, () => {
  console.error(`whoop-mcp HTTP server listening on :${config.http.port} (POST /mcp)`);
});

import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import {
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthRouter,
} from "@modelcontextprotocol/sdk/server/auth/router.js";
import express from "express";
import { config } from "../config.js";
import { buildServer } from "../mcp/server.js";
import { RedisOAuthProvider } from "../oauth/provider.js";
import { loginGate } from "../oauth/loginGate.js";
import { createTokenStore } from "../store/index.js";
import { WhoopClient } from "../whoop/client.js";

const methodNotAllowed = {
  jsonrpc: "2.0" as const,
  error: { code: -32000, message: "Method not allowed (stateless server)" },
  id: null,
};

/**
 * Builds the full HTTP app: an OAuth 2.1 authorization server (via the MCP SDK)
 * plus the bearer-protected MCP endpoint. Shared by the always-on container
 * (src/bin/http.ts) and the Vercel function (api/index.ts) so both expose the
 * exact same routes.
 */
export function createApp(): express.Express {
  config.requireWhoop();
  config.requireOAuth();

  const whoop = new WhoopClient(createTokenStore());
  const provider = new RedisOAuthProvider();
  const issuerUrl = new URL(config.oauth.publicUrl);
  const mcpUrl = new URL("/mcp", issuerUrl);

  const app = express();
  app.set("trust proxy", true); // behind Vercel / a container proxy

  // Password gate must run before the SDK's authorize handler mints a code.
  app.use("/authorize", express.urlencoded({ extended: false }), loginGate);

  // OAuth endpoints at the app root: /.well-known/*, /authorize, /token,
  // /register (DCR), /revoke. Rate limiting uses an in-memory store that resets
  // per serverless invocation (and trips proxy validation), so it's disabled.
  app.use(
    mcpAuthRouter({
      provider,
      issuerUrl,
      resourceServerUrl: mcpUrl,
      scopesSupported: ["whoop:read"],
      resourceName: "WHOOP MCP",
      authorizationOptions: { rateLimit: false },
      tokenOptions: { rateLimit: false },
      clientRegistrationOptions: { rateLimit: false },
      revocationOptions: { rateLimit: false },
    }),
  );

  const requireAuth = requireBearerAuth({
    verifier: provider,
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpUrl),
  });

  // The MCP endpoint — stateless: a fresh server + transport per request.
  app.post("/mcp", requireAuth, express.json(), async (req, res) => {
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
  app.get("/mcp", (_req, res) => {
    res.status(405).json(methodNotAllowed);
  });
  app.delete("/mcp", (_req, res) => {
    res.status(405).json(methodNotAllowed);
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/", (_req, res) => {
    res.type("text").send("whoop-mcp — MCP endpoint at POST /mcp (OAuth-protected).");
  });

  return app;
}

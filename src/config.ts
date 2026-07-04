import "dotenv/config";

/**
 * Central configuration, read once from the environment.
 * Nothing here is hardcoded — every secret is an env var (see .env.example).
 */
export const config = {
  whoop: {
    clientId: process.env.WHOOP_CLIENT_ID ?? "",
    clientSecret: process.env.WHOOP_CLIENT_SECRET ?? "",
    redirectUri: process.env.WHOOP_REDIRECT_URI ?? "http://127.0.0.1:3000/callback",
    // Must include "offline" to receive a refresh token from WHOOP.
    scopes: (
      process.env.WHOOP_SCOPES ??
      "offline read:recovery read:sleep read:workout read:cycles read:profile read:body_measurement"
    )
      .split(/\s+/)
      .filter(Boolean),
  },

  // Storage backend. Default is "file" (zero external deps, great for local /
  // Claude Desktop). Set STORAGE=redis on your remote/serverless deploy.
  storage: (process.env.STORAGE ?? "file") as "file" | "redis",
  tokenFile: process.env.TOKEN_FILE, // file mode only; defaults to ~/.whoop-mcp/tokens.json
  redisUrl: process.env.UPSTASH_REDIS_REST_URL,
  redisToken: process.env.UPSTASH_REDIS_REST_TOKEN,

  http: {
    port: Number(process.env.PORT ?? 3000),
  },

  // OAuth 2.1 authorization server config. This server issues its own tokens to
  // Claude (claude.ai custom connectors only speak OAuth, not static bearers).
  oauth: {
    // Public https base URL of this deployment — the OAuth issuer identifier.
    // e.g. https://whoop-mcp-blush.vercel.app  (no trailing slash, no path).
    publicUrl: (process.env.PUBLIC_BASE_URL ?? "").replace(/\/+$/, ""),
    // Single-user login that gates the consent page (/authorize).
    password: process.env.MCP_LOGIN_PASSWORD ?? "",
    accessTtlSec: Number(process.env.OAUTH_ACCESS_TTL ?? 3600), // 1 hour
    refreshTtlSec: Number(process.env.OAUTH_REFRESH_TTL ?? 60 * 24 * 3600), // 60 days
  },

  /** Throw early with a clear message if the WHOOP app creds are missing. */
  requireWhoop(): void {
    if (!config.whoop.clientId || !config.whoop.clientSecret) {
      throw new Error(
        "Missing WHOOP_CLIENT_ID / WHOOP_CLIENT_SECRET. Create an app at https://developer.whoop.com and set them in .env",
      );
    }
  },

  /** Guard the OAuth server prerequisites (public URL, login, shared storage). */
  requireOAuth(): void {
    if (!config.oauth.publicUrl) {
      throw new Error("Missing PUBLIC_BASE_URL — set it to this deploy's https URL (the OAuth issuer).");
    }
    if (!config.oauth.password) {
      throw new Error("Missing MCP_LOGIN_PASSWORD — the single-user login for the OAuth consent page (/authorize).");
    }
    if (config.storage !== "redis" || !config.redisUrl || !config.redisToken) {
      throw new Error("OAuth server requires STORAGE=redis with UPSTASH_REDIS_REST_URL/TOKEN (tokens must live in shared storage).");
    }
  },
};

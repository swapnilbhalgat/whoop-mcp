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
    // Gates Claude -> your server. Required when running the HTTP transport.
    bearerKey: process.env.MCP_BEARER_KEY ?? "",
  },

  /** Throw early with a clear message if the WHOOP app creds are missing. */
  requireWhoop(): void {
    if (!config.whoop.clientId || !config.whoop.clientSecret) {
      throw new Error(
        "Missing WHOOP_CLIENT_ID / WHOOP_CLIENT_SECRET. Create an app at https://developer.whoop.com and set them in .env",
      );
    }
  },
};

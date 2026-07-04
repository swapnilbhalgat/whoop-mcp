import { config } from "../config.js";
import { createApp } from "../http/app.js";

/**
 * Always-on HTTP server — deploy to any Node host (Railway/Render/Fly) or run
 * locally to test the remote path. Exposes the OAuth 2.1 endpoints plus the
 * bearer-protected POST /mcp. See src/http/app.ts for the routes.
 */
const app = createApp();
app.listen(config.http.port, () => {
  console.error(`whoop-mcp listening on :${config.http.port} — OAuth + POST /mcp`);
});

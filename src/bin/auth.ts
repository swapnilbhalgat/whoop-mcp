import { randomUUID } from "node:crypto";
import http from "node:http";
import { config } from "../config.js";
import { createTokenStore } from "../store/index.js";
import { WhoopClient } from "../whoop/client.js";

/**
 * One-time OAuth seeding. Prints the WHOOP authorize URL, spins a tiny local
 * server on the redirect URI, exchanges the returned code, and stores the
 * initial token chain. Run once per environment (or after revoking access).
 *
 *   STORAGE=redis npm run auth   # seed the same store your deploy uses
 */
async function main(): Promise<void> {
  config.requireWhoop();
  const whoop = new WhoopClient(createTokenStore());
  const state = randomUUID();
  const redirect = new URL(config.whoop.redirectUri);
  const port = Number(redirect.port || 3000);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    if (url.pathname !== redirect.pathname) {
      res.writeHead(404).end();
      return;
    }
    const code = url.searchParams.get("code");
    if (!code || url.searchParams.get("state") !== state) {
      res.writeHead(400).end("Invalid callback (missing code or state mismatch).");
      return;
    }
    try {
      await whoop.exchangeCode(code);
      res
        .writeHead(200, { "Content-Type": "text/html" })
        .end("<h1>WHOOP connected ✅</h1><p>Tokens stored. You can close this tab.</p>");
      console.error("\n✅ Authenticated. Tokens written to the configured store.");
    } catch (err) {
      res.writeHead(500).end("Token exchange failed — check the terminal.");
      console.error("\n❌ Token exchange failed:", err);
    } finally {
      server.close();
      setTimeout(() => process.exit(0), 100);
    }
  });

  server.listen(port, () => {
    console.error("\nOpen this URL in your browser to authorize WHOOP:\n");
    console.error(whoop.getAuthorizeUrl(state) + "\n");
    console.error(`Waiting for the callback on ${config.whoop.redirectUri} ...`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

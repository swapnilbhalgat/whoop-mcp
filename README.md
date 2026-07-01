# whoop-mcp

A **self-hosted [MCP](https://modelcontextprotocol.io) server for your [WHOOP](https://www.whoop.com) data**, built on the **official WHOOP v2 OAuth API**.

Bring your own WHOOP developer app (client id + secret). Your tokens live in storage *you* control — a local file or *your* Redis. Nothing routes through a third party, and because it uses the official API, it does not violate WHOOP's terms.

## Why this exists

| Approach | ToS-safe | Data stays yours | Multi-device / scheduled |
| --- | --- | --- | --- |
| Private-API impersonation servers | ❌ account risk | local only | depends |
| Hosted SaaS connectors | ✅ | ❌ third party holds it | ✅ |
| **whoop-mcp (this)** | ✅ official API | ✅ your infra | ✅ when deployed remotely |

## Tools

`whoop_get_recovery`, `whoop_get_sleep`, `whoop_get_cycles`, `whoop_get_workouts`, `whoop_get_profile` — each accepts `start` / `end` (ISO 8601) and `limit` where applicable.

## Architecture

```
Claude ──bearer key──▶ whoop-mcp ──OAuth (your client id/secret + token)──▶ WHOOP v2 API
                          │
                          └── token store: file (local) | Redis (remote)
```

Two auth boundaries, kept separate:

- **Claude → your server**: a bearer key you set (`MCP_BEARER_KEY`), also pasted into Claude's connector config.
- **Your server → WHOOP**: your app's client id/secret + a stored, auto-rotating refresh token. **Claude never sees your WHOOP credentials.**

### Refresh tokens are single-use

WHOOP rotates the refresh token on every use — each refresh returns a *new* one and invalidates the old. So the store must (a) **write back** the rotated token atomically and (b) **lock** so two requests can't spend the same token. Both backends handle this; it's why remote/serverless needs Redis (shared, atomic) while a single local process is fine with a file.

## Prerequisites

1. Node ≥ 20.
2. A WHOOP app at <https://developer.whoop.com>:
   - Add redirect URI `http://127.0.0.1:3000/callback` (for the one-time auth step).
   - Enable scopes: `offline`, `read:recovery`, `read:sleep`, `read:workout`, `read:cycles`, `read:profile`, `read:body_measurement`.
   - Copy the **Client ID** and **Client Secret**.

```bash
npm install
cp .env.example .env   # fill in WHOOP_CLIENT_ID / WHOOP_CLIENT_SECRET
```

## Option A — Local (file storage, Claude Desktop)

```bash
npm run auth          # opens the WHOOP consent URL; stores tokens at ~/.whoop-mcp/tokens.json
npm run build
```

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "whoop": {
      "command": "node",
      "args": ["/absolute/path/to/whoop-mcp/dist/bin/stdio.js"]
    }
  }
}
```

Restart Claude Desktop and ask "What's my WHOOP recovery today?". (Works only while Desktop is open on this machine.)

## Option B — Remote (Redis storage, works from web + phone + scheduled)

This is the deploy that satisfies "available everywhere + automated". Set these env vars on your host:

```
STORAGE=redis
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
MCP_BEARER_KEY=<long random string>
WHOOP_CLIENT_ID=...
WHOOP_CLIENT_SECRET=...
WHOOP_REDIRECT_URI=http://127.0.0.1:3000/callback
```

**1. Seed the token chain into Redis** (run locally once, pointing at the same Upstash):

```bash
STORAGE=redis UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... npm run auth
```

**2. Deploy.** Two supported targets, same code:

- **Vercel (serverless):** `api/mcp.ts` is a ready [`@vercel/mcp-adapter`](https://vercel.com/docs/mcp) function (route `POST /api/mcp`). Run `vercel --prod`, set the env vars above in the Vercel project, and you're done. Requires `STORAGE=redis`.
- **Always-on container (Railway / Render / Fly):** a standard long-running process — `npm run build && node dist/bin/http.js`, exposing `POST /mcp` and `GET /health`. No adapter needed; works with file *or* redis storage.

**3. Add it to Claude** as a custom connector: Settings → Connectors → Add custom connector → URL `https://your-host/api/mcp` (Vercel) or `https://your-host/mcp` (container), API key = your `MCP_BEARER_KEY`. Works across claude.ai web, mobile, and desktop, and is available to scheduled [Routines](https://code.claude.com/docs/en/routines).

## Test locally without Claude

```bash
npm run start:http      # in one shell (needs MCP_BEARER_KEY set)
curl -s localhost:3000/health
curl -s localhost:3000/mcp -H "Authorization: Bearer $MCP_BEARER_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Open-source / share it

This is a **single-tenant template**: each person clones it, registers their own WHOOP app, and deploys their own instance — so everyone's data stays on their own infrastructure. No secrets are committed; all config is env vars. (A multi-tenant hosted service is a deliberately bigger project — per-user encryption, identity, tenant isolation.)

## Security notes

- Never commit `.env` or `tokens.json` (both are gitignored).
- Treat `MCP_BEARER_KEY` like a password; rotate it by updating the env var and the Claude connector.
- If you lose the stored refresh token, just re-run `npm run auth`.

## License

MIT — see [LICENSE](./LICENSE). Uses the official WHOOP API; you must supply your own developer app credentials.

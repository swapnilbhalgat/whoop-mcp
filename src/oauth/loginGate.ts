import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { config } from "../config.js";

// OAuth authorization-request params we must carry through the login form so the
// SDK's authorize handler still sees them on the authenticated POST.
const PASSTHROUGH = [
  "response_type",
  "client_id",
  "redirect_uri",
  "code_challenge",
  "code_challenge_method",
  "scope",
  "state",
  "resource",
] as const;

function passwordOk(input: unknown): boolean {
  if (typeof input !== "string" || !config.oauth.password) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(config.oauth.password);
  return a.length === b.length && timingSafeEqual(a, b);
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

function loginPage(params: Record<string, unknown>, failed: boolean): string {
  const hidden = PASSTHROUGH.filter((f) => params[f] !== undefined && params[f] !== "")
    .map((f) => `<input type="hidden" name="${f}" value="${escapeHtml(String(params[f]))}" />`)
    .join("\n      ");
  const error = failed
    ? '<p style="color:#c00;margin:0 0 1rem">Incorrect password — try again.</p>'
    : "";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Connect WHOOP MCP</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 24rem; margin: 6rem auto; padding: 0 1rem; }
      h1 { font-size: 1.25rem; } input[type=password] { width: 100%; padding: .6rem; font-size: 1rem; box-sizing: border-box; }
      button { margin-top: 1rem; padding: .6rem 1rem; font-size: 1rem; cursor: pointer; }
      p.hint { color:#666; font-size:.85rem; }
    </style>
  </head>
  <body>
    <h1>Connect to your WHOOP MCP</h1>
    <p class="hint">Enter your server password to let Claude access your WHOOP data.</p>
    ${error}
    <form method="post" action="/authorize">
      ${hidden}
      <input type="password" name="password" placeholder="Password" autofocus required />
      <button type="submit">Authorize</button>
    </form>
  </body>
</html>`;
}

/**
 * Single-user password gate that sits in front of the OAuth /authorize endpoint.
 *
 * - GET /authorize  -> render the login form (hidden fields carry the OAuth params).
 * - POST /authorize with the correct password -> next(): the SDK handler then
 *   reads those params from the body and issues the authorization code.
 * - POST with a wrong/missing password -> re-render the form with an error.
 *
 * The SDK's authorize handler runs identically on GET and POST, so gating here
 * (before it) is what makes an unauthenticated caller unable to get a code.
 */
export const loginGate: RequestHandler = (req, res, next) => {
  if (req.method === "POST" && passwordOk((req.body as Record<string, unknown> | undefined)?.password)) {
    next();
    return;
  }
  const params = (req.method === "POST" ? req.body : req.query) as Record<string, unknown>;
  const failed = req.method === "POST"; // a POST reaching here means the password was wrong
  res.status(failed ? 401 : 200).type("html").send(loginPage(params ?? {}, failed));
};

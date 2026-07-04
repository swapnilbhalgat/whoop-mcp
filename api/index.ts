import { createApp } from "../src/http/app.js";

/**
 * Vercel serverless entrypoint. An Express app is itself a (req, res) handler,
 * so we export it directly. vercel.json rewrites the root-level OAuth paths and
 * /mcp to this function, so the app sees the original request paths and its
 * router (including /.well-known/* and /authorize) works unchanged.
 */
export default createApp();

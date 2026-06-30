import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config } from "../config.js";
import { buildServer } from "../mcp/server.js";
import { createTokenStore } from "../store/index.js";
import { WhoopClient } from "../whoop/client.js";

/**
 * Local stdio transport — for Claude Desktop / Cursor on this machine.
 * Logs go to stderr so they don't corrupt the stdio JSON-RPC stream.
 */
async function main(): Promise<void> {
  config.requireWhoop();
  const whoop = new WhoopClient(createTokenStore());
  const server = buildServer(whoop);
  await server.connect(new StdioServerTransport());
  console.error("whoop-mcp stdio server ready");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

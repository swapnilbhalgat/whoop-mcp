import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WhoopClient } from "../whoop/client.js";
import { V2 } from "../whoop/endpoints.js";

// Shared input shape for the collection endpoints. `limit` is the total number
// of records to return; the client auto-paginates WHOOP's 25-per-page cursor
// under the hood, up to this many.
const rangeShape = {
  start: z.string().optional().describe("ISO 8601 start, e.g. 2026-06-01T00:00:00Z"),
  end: z.string().optional().describe("ISO 8601 end, e.g. 2026-06-28T00:00:00Z"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe("Max total records to return (default 25; auto-paginated up to 200)"),
};

async function collection(
  whoop: WhoopClient,
  path: string,
  a: { start?: string; end?: string; limit?: number },
) {
  const records = await whoop.getAll(path, { start: a.start, end: a.end, maxRecords: a.limit ?? 25 });
  return json({ count: records.length, records });
}

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

/** Register all WHOOP tools onto a server. Shared by every transport. */
export function registerTools(server: McpServer, whoop: WhoopClient): void {
  server.registerTool(
    "whoop_get_recovery",
    {
      title: "Get recovery",
      description: "Recovery scores (recovery %, HRV, resting heart rate) over a date range.",
      inputSchema: rangeShape,
    },
    async (a) => collection(whoop, V2.recovery, a),
  );

  server.registerTool(
    "whoop_get_sleep",
    {
      title: "Get sleep",
      description: "Sleep activities including stages (REM/deep/light) and sleep performance.",
      inputSchema: rangeShape,
    },
    async (a) => collection(whoop, V2.sleep, a),
  );

  server.registerTool(
    "whoop_get_cycles",
    {
      title: "Get cycles",
      description: "Physiological cycles including day strain and average heart rate.",
      inputSchema: rangeShape,
    },
    async (a) => collection(whoop, V2.cycle, a),
  );

  server.registerTool(
    "whoop_get_workouts",
    {
      title: "Get workouts",
      description: "Workout activities including strain, energy, and heart-rate zones.",
      inputSchema: rangeShape,
    },
    async (a) => collection(whoop, V2.workout, a),
  );

  server.registerTool(
    "whoop_get_profile",
    { title: "Get profile", description: "Basic WHOOP user profile.", inputSchema: {} },
    async () => json(await whoop.get(V2.profile)),
  );
}

export function buildServer(whoop: WhoopClient): McpServer {
  const server = new McpServer({ name: "whoop-mcp", version: "0.1.0" });
  registerTools(server, whoop);
  return server;
}

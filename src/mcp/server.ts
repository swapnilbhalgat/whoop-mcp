import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WhoopClient } from "../whoop/client.js";
import { V2 } from "../whoop/endpoints.js";

// Shared input shape for the collection endpoints. WHOOP accepts `start`/`end`
// (ISO 8601) and `limit` query params.
const rangeShape = {
  start: z.string().optional().describe("ISO 8601 start, e.g. 2026-06-01T00:00:00Z"),
  end: z.string().optional().describe("ISO 8601 end, e.g. 2026-06-28T00:00:00Z"),
  limit: z.number().int().min(1).max(25).optional().describe("Max records (default 10)"),
};

function rangeQuery(a: { start?: string; end?: string; limit?: number }) {
  return { start: a.start, end: a.end, limit: a.limit ?? 10 };
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
    async (a) => json(await whoop.get(V2.recovery, rangeQuery(a))),
  );

  server.registerTool(
    "whoop_get_sleep",
    {
      title: "Get sleep",
      description: "Sleep activities including stages (REM/deep/light) and sleep performance.",
      inputSchema: rangeShape,
    },
    async (a) => json(await whoop.get(V2.sleep, rangeQuery(a))),
  );

  server.registerTool(
    "whoop_get_cycles",
    {
      title: "Get cycles",
      description: "Physiological cycles including day strain and average heart rate.",
      inputSchema: rangeShape,
    },
    async (a) => json(await whoop.get(V2.cycle, rangeQuery(a))),
  );

  server.registerTool(
    "whoop_get_workouts",
    {
      title: "Get workouts",
      description: "Workout activities including strain, energy, and heart-rate zones.",
      inputSchema: rangeShape,
    },
    async (a) => json(await whoop.get(V2.workout, rangeQuery(a))),
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

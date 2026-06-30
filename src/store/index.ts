import { homedir } from "node:os";
import { join } from "node:path";
import { Redis } from "@upstash/redis";
import { config } from "../config.js";
import { FileTokenStore } from "./FileTokenStore.js";
import { RedisTokenStore } from "./RedisTokenStore.js";
import type { TokenStore } from "./TokenStore.js";

/** Pick the storage backend from config (STORAGE=file|redis). */
export function createTokenStore(): TokenStore {
  if (config.storage === "redis") {
    if (!config.redisUrl || !config.redisToken) {
      throw new Error(
        "STORAGE=redis requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN",
      );
    }
    return new RedisTokenStore(
      new Redis({ url: config.redisUrl, token: config.redisToken }),
    );
  }
  const path = config.tokenFile ?? join(homedir(), ".whoop-mcp", "tokens.json");
  return new FileTokenStore(path);
}

export type { StoredTokens, TokenStore } from "./TokenStore.js";

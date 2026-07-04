import { Redis } from "@upstash/redis";
import { config } from "./config.js";

let client: Redis | null = null;

/**
 * Shared Upstash Redis client (serverless-friendly REST client). Used by both
 * the WHOOP token store and the OAuth provider so a single connection config
 * serves the whole app.
 */
export function getRedis(): Redis {
  if (!config.redisUrl || !config.redisToken) {
    throw new Error(
      "Redis is required here — set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN",
    );
  }
  client ??= new Redis({ url: config.redisUrl, token: config.redisToken });
  return client;
}

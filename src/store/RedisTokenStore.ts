import { Redis } from "@upstash/redis";
import type { StoredTokens, TokenStore } from "./TokenStore.js";

const TOKEN_KEY = "whoop:tokens";
const LOCK_KEY = "whoop:refresh-lock";

/**
 * Redis-backed store for serverless / remote deploys (e.g. Vercel + Upstash),
 * where storage is shared and multiple invocations may try to refresh at once.
 */
export class RedisTokenStore implements TokenStore {
  private readonly lockId = `${process.pid}-${Math.random().toString(36).slice(2)}`;

  constructor(private readonly redis: Redis) {}

  async get(): Promise<StoredTokens | null> {
    return (await this.redis.get<StoredTokens>(TOKEN_KEY)) ?? null;
  }

  async set(tokens: StoredTokens): Promise<void> {
    await this.redis.set(TOKEN_KEY, tokens);
  }

  /**
   * Distributed lock so two invocations can't both spend the single-use
   * refresh token. The caller re-reads state inside the lock, so if we fail to
   * acquire and proceed anyway, the re-check still prevents a double refresh in
   * the common case.
   */
  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const acquired = await this.acquire();
    try {
      return await fn();
    } finally {
      if (acquired) await this.release();
    }
  }

  private async acquire(ttlMs = 10_000, timeoutMs = 8_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const ok = await this.redis.set(LOCK_KEY, this.lockId, { nx: true, px: ttlMs });
      if (ok === "OK") return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return false; // proceed without the lock rather than hang the request
  }

  private async release(): Promise<void> {
    // Compare-and-delete so we only release a lock we still own.
    const lua =
      'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';
    await this.redis.eval(lua, [LOCK_KEY], [this.lockId]);
  }
}

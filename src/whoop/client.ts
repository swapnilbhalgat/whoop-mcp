import { config } from "../config.js";
import type { StoredTokens, TokenStore } from "../store/index.js";
import { WHOOP_API_BASE, WHOOP_AUTH_URL, WHOOP_TOKEN_URL } from "./endpoints.js";

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
  token_type: string;
  scope?: string;
}

/** How long before actual expiry we proactively refresh. */
const REFRESH_SKEW_MS = 60_000;

/**
 * Thin WHOOP v2 client. Owns the OAuth lifecycle:
 *  - exchangeCode (one-time, via the auth CLI)
 *  - getAccessToken: returns a valid token, refreshing atomically when needed
 *
 * Refresh tokens are SINGLE-USE and rotate, so every refresh writes the new
 * token back to the store, and all refreshes run inside store.withLock().
 */
export class WhoopClient {
  constructor(private readonly store: TokenStore) {}

  getAuthorizeUrl(state: string): string {
    const p = new URLSearchParams({
      response_type: "code",
      client_id: config.whoop.clientId,
      redirect_uri: config.whoop.redirectUri,
      scope: config.whoop.scopes.join(" "),
      state,
    });
    return `${WHOOP_AUTH_URL}?${p.toString()}`;
  }

  async exchangeCode(code: string): Promise<void> {
    const tokens = await this.tokenRequest({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.whoop.redirectUri,
    });
    await this.store.set(tokens);
  }

  async getAccessToken(): Promise<string> {
    const current = await this.store.get();
    if (!current) {
      throw new Error("Not authenticated. Run `npm run auth` first.");
    }
    if (current.expires_at - Date.now() > REFRESH_SKEW_MS) {
      return current.access_token;
    }
    return this.refresh();
  }

  /** GET a WHOOP v2 endpoint, refreshing once on a 401. */
  async get<T = unknown>(
    path: string,
    query?: Record<string, string | number | undefined>,
  ): Promise<T> {
    const url = new URL(WHOOP_API_BASE + path);
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }

    let res = await fetch(url, { headers: { Authorization: `Bearer ${await this.getAccessToken()}` } });
    if (res.status === 401) {
      // Token may have been revoked before its nominal expiry; force one refresh.
      res = await fetch(url, { headers: { Authorization: `Bearer ${await this.refresh()}` } });
    }
    if (!res.ok) {
      throw new Error(`WHOOP GET ${path} -> ${res.status} ${res.statusText}: ${await res.text()}`);
    }
    return (await res.json()) as T;
  }

  /**
   * Fetch a WHOOP *collection* endpoint across pages and return the flattened
   * records. WHOOP returns at most 25 per page plus a `next_token` cursor when
   * more exist; we follow it until exhausted or we hit `maxRecords` (a safety
   * cap so an open-ended range can't balloon the response).
   */
  async getAll<T = unknown>(
    path: string,
    opts: { start?: string; end?: string; maxRecords?: number } = {},
  ): Promise<T[]> {
    const maxRecords = Math.max(1, opts.maxRecords ?? 25);
    const out: T[] = [];
    let nextToken: string | undefined;

    do {
      const page = await this.get<{ records?: T[]; next_token?: string; nextToken?: string }>(path, {
        start: opts.start,
        end: opts.end,
        limit: 25, // WHOOP's max page size
        nextToken,
      });
      if (Array.isArray(page.records)) out.push(...page.records);
      nextToken = page.next_token ?? page.nextToken;
    } while (nextToken && out.length < maxRecords);

    return out.slice(0, maxRecords);
  }

  /** Atomically refresh, re-checking inside the lock to avoid double-spend. */
  private refresh(): Promise<string> {
    return this.store.withLock(async () => {
      const latest = await this.store.get();
      if (!latest) throw new Error("Not authenticated.");
      // Another worker may have refreshed while we waited for the lock.
      if (latest.expires_at - Date.now() > REFRESH_SKEW_MS) {
        return latest.access_token;
      }
      const refreshed = await this.tokenRequest({
        grant_type: "refresh_token",
        refresh_token: latest.refresh_token,
        scope: "offline",
      });
      await this.store.set(refreshed); // write back the rotated refresh token
      return refreshed.access_token;
    });
  }

  private async tokenRequest(params: Record<string, string>): Promise<StoredTokens> {
    const body = new URLSearchParams({
      ...params,
      client_id: config.whoop.clientId,
      client_secret: config.whoop.clientSecret,
    });
    const res = await fetch(WHOOP_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      throw new Error(`WHOOP token request failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as TokenResponse;
    return {
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_at: Date.now() + json.expires_in * 1000,
    };
  }
}

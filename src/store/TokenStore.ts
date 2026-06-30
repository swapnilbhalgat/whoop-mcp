/** The single blob we persist. `expires_at` is epoch milliseconds. */
export interface StoredTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

/**
 * Storage abstraction. The refresh logic depends only on this interface, never
 * on whether the backend is a file or Redis. Implementations must provide:
 *  - get/set: durable read + atomic overwrite of the token blob
 *  - withLock: serialize refreshes so the single-use WHOOP refresh token is
 *    never spent twice concurrently (which would brick the rotation chain).
 */
export interface TokenStore {
  get(): Promise<StoredTokens | null>;
  set(tokens: StoredTokens): Promise<void>;
  withLock<T>(fn: () => Promise<T>): Promise<T>;
}

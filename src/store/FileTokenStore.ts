import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import type { StoredTokens, TokenStore } from "./TokenStore.js";

/**
 * File-backed store for local / single-process use (Claude Desktop, one
 * container). No external services required.
 */
export class FileTokenStore implements TokenStore {
  // In-process mutex: a promise chain. Enough because local/stdio runs as a
  // single Node process; cross-process concurrency needs Redis instead.
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly path: string) {}

  async get(): Promise<StoredTokens | null> {
    try {
      return JSON.parse(await fs.readFile(this.path, "utf8")) as StoredTokens;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async set(tokens: StoredTokens): Promise<void> {
    await fs.mkdir(dirname(this.path), { recursive: true });
    // Write to a temp file then rename: rename is atomic on POSIX, so a reader
    // never sees a half-written file and a crash can't corrupt the token chain.
    const tmp = `${this.path}.tmp-${process.pid}`;
    await fs.writeFile(tmp, JSON.stringify(tokens, null, 2), { mode: 0o600 });
    await fs.rename(tmp, this.path);
  }

  withLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    // Keep the chain alive regardless of success/failure of `fn`.
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

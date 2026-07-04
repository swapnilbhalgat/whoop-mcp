import { randomBytes, randomUUID } from "node:crypto";
import type { Response } from "express";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type {
  AuthorizationParams,
  OAuthServerProvider,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { config } from "../config.js";
import { getRedis } from "../redis.js";

/** A fresh opaque token / code (256 bits of entropy). */
const mint = (): string => randomBytes(32).toString("hex");

type CodeRecord = {
  clientId: string;
  codeChallenge: string;
  redirectUri: string;
  scopes: string[];
  resource?: string;
};
type AccessRecord = { clientId: string; scopes: string[]; resource?: string; expiresAt: number };
type RefreshRecord = { clientId: string; scopes: string[]; resource?: string };

const CLIENT = (id: string): string => `oauth:client:${id}`;
const CODE = (c: string): string => `oauth:code:${c}`;
const ACCESS = (t: string): string => `oauth:at:${t}`;
const REFRESH = (t: string): string => `oauth:rt:${t}`;

/**
 * A minimal, single-user OAuth 2.1 authorization server, backed by Upstash
 * Redis so state survives across stateless serverless invocations.
 *
 * The SDK's router handles the protocol wiring (metadata, PKCE validation, DCR
 * plumbing, token endpoint); this class supplies the storage + token issuance.
 * "Who is the user" is enforced upstream by the password gate on /authorize, so
 * by the time authorize() runs the request is already trusted.
 */
export class RedisOAuthProvider implements OAuthServerProvider {
  private readonly redis = getRedis();

  readonly clientsStore: OAuthRegisteredClientsStore = {
    getClient: async (clientId) =>
      (await this.redis.get<OAuthClientInformationFull>(CLIENT(clientId))) ?? undefined,
    // Dynamic Client Registration: the SDK generates client_id/secret (its type
    // omits client_id since generation is configurable), we persist and return.
    registerClient: async (client) => {
      const full = client as OAuthClientInformationFull;
      const clientId = full.client_id ?? randomUUID();
      const stored: OAuthClientInformationFull = {
        ...full,
        client_id: clientId,
        client_id_issued_at: full.client_id_issued_at ?? Math.floor(Date.now() / 1000),
      };
      await this.redis.set(CLIENT(clientId), stored, { ex: config.oauth.refreshTtlSec });
      return stored;
    },
  };

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    const code = mint();
    const record: CodeRecord = {
      clientId: client.client_id,
      codeChallenge: params.codeChallenge,
      redirectUri: params.redirectUri,
      scopes: params.scopes ?? [],
      resource: params.resource?.href,
    };
    await this.redis.set(CODE(code), record, { ex: 300 }); // codes are short-lived
    const redirect = new URL(params.redirectUri);
    redirect.searchParams.set("code", code);
    if (params.state !== undefined) redirect.searchParams.set("state", params.state);
    res.redirect(302, redirect.href);
  }

  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const record = await this.redis.get<CodeRecord>(CODE(authorizationCode));
    if (!record || record.clientId !== client.client_id) {
      throw new Error("invalid authorization code");
    }
    return record.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string, // PKCE already verified by the SDK
    redirectUri?: string,
  ): Promise<OAuthTokens> {
    const record = await this.redis.get<CodeRecord>(CODE(authorizationCode));
    if (!record || record.clientId !== client.client_id) {
      throw new Error("invalid authorization code");
    }
    if (redirectUri !== undefined && redirectUri !== record.redirectUri) {
      throw new Error("redirect_uri mismatch");
    }
    await this.redis.del(CODE(authorizationCode)); // single-use
    return this.issueTokens(client.client_id, record.scopes, record.resource);
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
  ): Promise<OAuthTokens> {
    const record = await this.redis.get<RefreshRecord>(REFRESH(refreshToken));
    if (!record || record.clientId !== client.client_id) {
      throw new Error("invalid refresh token");
    }
    await this.redis.del(REFRESH(refreshToken)); // rotate on use
    const grantScopes = scopes && scopes.length ? scopes : record.scopes;
    return this.issueTokens(client.client_id, grantScopes, record.resource);
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const record = await this.redis.get<AccessRecord>(ACCESS(token));
    if (!record) throw new Error("invalid or expired token");
    const info: AuthInfo = {
      token,
      clientId: record.clientId,
      scopes: record.scopes,
      expiresAt: record.expiresAt,
    };
    if (record.resource) info.resource = new URL(record.resource);
    return info;
  }

  async revokeToken(
    _client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ): Promise<void> {
    await this.redis.del(ACCESS(request.token), REFRESH(request.token));
  }

  private async issueTokens(
    clientId: string,
    scopes: string[],
    resource?: string,
  ): Promise<OAuthTokens> {
    const accessToken = mint();
    const refreshToken = mint();
    const expiresAt = Math.floor(Date.now() / 1000) + config.oauth.accessTtlSec;

    const access: AccessRecord = { clientId, scopes, resource, expiresAt };
    const refresh: RefreshRecord = { clientId, scopes, resource };
    await this.redis.set(ACCESS(accessToken), access, { ex: config.oauth.accessTtlSec });
    await this.redis.set(REFRESH(refreshToken), refresh, { ex: config.oauth.refreshTtlSec });

    const tokens: OAuthTokens = {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: config.oauth.accessTtlSec,
      refresh_token: refreshToken,
    };
    if (scopes.length) tokens.scope = scopes.join(" ");
    return tokens;
  }
}

/* Credential-free seam: no live transport, private store, or template wiring. */
export interface OuraTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

export interface StoredOuraTokens extends OuraTokens {
  generation: string;
}

export interface OuraLease {
  /** Opaque fencing token. Store implementations must reject stale fences. */
  fence: string;
}

export interface OuraCredentialStore {
  /** Serializes writers per account; release even when callback throws. */
  withLease<T>(accountId: string, callback: (lease: OuraLease) => Promise<T>): Promise<T>;
  load(accountId: string, lease: OuraLease): Promise<StoredOuraTokens | null>;
  /** Atomic durable CAS, including fence check; false means stale generation/lease. */
  replace(accountId: string, lease: OuraLease, generation: string, next: OuraTokens): Promise<boolean>;
}

export type OuraCredentialFailure =
  | "store_failed"
  | "invalid_stored_credential"
  | "refresh_failed"
  | "invalid_replacement"
  | "stale_generation"
  | "data_failed";

export class OuraCredentialError extends Error {
  constructor(public readonly code: OuraCredentialFailure) {
    super(code);
    this.name = "OuraCredentialError";
  }
}

const validToken = (token: unknown): token is string => typeof token === "string" && token.trim().length > 0;
const validExpiry = (expiry: unknown): expiry is string =>
  typeof expiry === "string" && Number.isFinite(Date.parse(expiry));

/**
 * Resolve under a store-enforced single-writer lease. Never retry an ambiguous
 * refresh; replacement must be durable before the read callback may execute.
 * Errors carry only fixed reason codes, not provider/store exceptions or tokens.
 */
export async function withOuraAccessToken<T>(
  accountId: string,
  store: OuraCredentialStore,
  refresh: (refreshToken: string) => Promise<OuraTokens>,
  read: (accessToken: string) => Promise<T>,
  now: Date = new Date()
): Promise<T> {
  let accessToken: string;
  try {
    accessToken = await store.withLease(accountId, async (lease) => {
      let stored: StoredOuraTokens | null;
      try {
        stored = await store.load(accountId, lease);
      } catch {
        throw new OuraCredentialError("store_failed");
      }
      if (
        !stored || !validToken(stored.generation) || !validToken(stored.accessToken) ||
        !validToken(stored.refreshToken) || !validExpiry(stored.expiresAt)
      ) throw new OuraCredentialError("invalid_stored_credential");
      if (Date.parse(stored.expiresAt) > now.getTime() + 60_000) return stored.accessToken;

      let next: OuraTokens;
      try {
        next = await refresh(stored.refreshToken);
      } catch {
        throw new OuraCredentialError("refresh_failed");
      }
      if (
        !next || !validToken(next.accessToken) || !validToken(next.refreshToken) ||
        !validExpiry(next.expiresAt) || Date.parse(next.expiresAt) <= now.getTime() + 60_000
      ) throw new OuraCredentialError("invalid_replacement");
      let committed: boolean;
      try {
        committed = await store.replace(accountId, lease, stored.generation, next);
      } catch {
        throw new OuraCredentialError("store_failed");
      }
      if (!committed) throw new OuraCredentialError("stale_generation");
      return next.accessToken;
    });
  } catch (error) {
    if (error instanceof OuraCredentialError) throw error;
    throw new OuraCredentialError("store_failed");
  }
  try {
    return await read(accessToken);
  } catch {
    throw new OuraCredentialError("data_failed");
  }
}

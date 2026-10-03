/* Unwired owner-consent seam. Caller must privately persist and consume an attempt once;
 * this module does not exchange codes, store tokens, or run in the daily template. */
import { createHash, randomBytes, timingSafeEqual } from "crypto";

const AUTHORIZE_URL = "https://cloud.ouraring.com/oauth/authorize";
const scopes = new Set(["personal", "daily"]); // Current adapter's weight and daily summary reads only.
type OuraScope = "personal" | "daily";
type OuraAuthorizationFailure = "invalid_authorization" | "authorization_denied" | "invalid_callback";

export class OuraAuthorizationError extends Error {
  constructor(public readonly code: OuraAuthorizationFailure) {
    super(code);
    this.name = "OuraAuthorizationError";
  }
}

export interface OuraAuthorizationConfig {
  clientId: string;
  redirectUri: string;
  allowedRedirectUris: string[];
  scopes: OuraScope[];
}

export interface OuraAuthorizationAttempt {
  url: string;
  state: string;
  codeVerifier: string;
  redirectUri: string;
  scopes: OuraScope[];
}

function validRedirect(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !!url.hostname && !url.username && !url.password &&
      !url.search && !url.hash && url.toString() === value;
  } catch {
    return false;
  }
}

/** Caller privately stores this attempt against a short-lived owner session. */
export function beginOuraAuthorization(config: OuraAuthorizationConfig): OuraAuthorizationAttempt {
  if (
    !config || typeof config.clientId !== "string" || !config.clientId.trim() ||
    typeof config.redirectUri !== "string" || !validRedirect(config.redirectUri) ||
    !Array.isArray(config.allowedRedirectUris) || !config.allowedRedirectUris.includes(config.redirectUri) ||
    !Array.isArray(config.scopes) || config.scopes.length === 0 ||
    config.scopes.some((scope) => !scopes.has(scope)) || new Set(config.scopes).size !== config.scopes.length
  ) throw new OuraAuthorizationError("invalid_authorization");

  const state = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(32).toString("base64url");
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", config.scopes.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", createHash("sha256").update(codeVerifier).digest("base64url"));
  url.searchParams.set("code_challenge_method", "S256");
  return { url: url.toString(), state, codeVerifier, redirectUri: config.redirectUri, scopes: [...config.scopes] };
}

export interface PendingOuraAuthorization {
  /** Atomic, single-use take scoped to an owner session. Never return an attempt twice. */
  consume(sessionId: string, state: string): Promise<(OuraAuthorizationAttempt & { issuedAt: string }) | null>;
}

/** Validate one privately stored attempt before any code exchange. No concrete store is wired. */
export async function consumeOuraAuthorizationCallback(
  callbackUrl: string,
  sessionId: string,
  pending: PendingOuraAuthorization,
  now: Date = new Date()
): Promise<{ code: string; codeVerifier: string; scopes: OuraScope[] }> {
  let callback: URL;
  try {
    callback = new URL(callbackUrl);
  } catch {
    throw new OuraAuthorizationError("invalid_callback");
  }
  const receivedState = callback.searchParams.get("state") || "";
  if (
    typeof sessionId !== "string" || !sessionId.trim() ||
    !/^[A-Za-z0-9_-]{43}$/.test(receivedState) ||
    callback.searchParams.getAll("state").length !== 1 ||
    !pending || typeof pending.consume !== "function"
  ) throw new OuraAuthorizationError("invalid_callback");
  let attempt: (OuraAuthorizationAttempt & { issuedAt: string }) | null;
  try {
    attempt = await pending.consume(sessionId, receivedState);
  } catch {
    throw new OuraAuthorizationError("invalid_callback");
  }
  const issuedAt = attempt && Date.parse(attempt.issuedAt);
  const timestamp = now.getTime();
  if (
    !attempt || !Number.isFinite(issuedAt) || !Number.isFinite(timestamp) ||
    timestamp < issuedAt! || timestamp - issuedAt! > 600_000 ||
    !validRedirect(attempt.redirectUri) ||
    !/^[A-Za-z0-9_-]{43}$/.test(attempt.state) ||
    !/^[A-Za-z0-9_-]{43}$/.test(attempt.codeVerifier) ||
    !Array.isArray(attempt.scopes) || !attempt.scopes.length ||
    attempt.scopes.some((scope) => !scopes.has(scope)) ||
    callback.origin + callback.pathname !== attempt.redirectUri || callback.username || callback.password || callback.hash ||
    [...callback.searchParams.keys()].some((key) => !["code", "state", "scope", "error", "error_description"].includes(key)) ||
    [...callback.searchParams.keys()].some((key) => callback.searchParams.getAll(key).length !== 1)
  ) throw new OuraAuthorizationError("invalid_callback");
  const expected = Buffer.from(attempt.state);
  const received = Buffer.from(receivedState);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new OuraAuthorizationError("invalid_callback");
  }
  if (callback.searchParams.has("error")) throw new OuraAuthorizationError("authorization_denied");
  const code = callback.searchParams.get("code");
  const granted = callback.searchParams.get("scope")?.split(" ");
  if (
    !code?.trim() || !granted || new Set(granted).size !== granted.length ||
    granted.length !== attempt.scopes.length ||
    attempt.scopes.some((scope) => !granted.includes(scope))
  ) throw new OuraAuthorizationError("invalid_callback");
  return { code, codeVerifier: attempt.codeVerifier, scopes: [...attempt.scopes] };
}

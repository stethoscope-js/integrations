/* Unwired owner-consent transport: no callback server, token store, or daily-template integration. */
import axios from "axios";
import { OuraCredentialError, OuraTokens } from "./oura-credential-broker";

const TOKEN_URL = "https://api.ouraring.com/oauth/token";

interface OuraCodeCallback {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}

interface OuraClientCredentials {
  clientId: string;
  clientSecret: string;
}

/** Exchange only a consumed, owner-session-validated callback; caller must durably store the result before use. */
export async function exchangeOuraAuthorizationCode(
  callback: OuraCodeCallback,
  credentials: OuraClientCredentials,
  allowedRedirectUris: string[],
  clock: () => Date = () => new Date()
): Promise<OuraTokens> {
  let redirect: URL;
  try {
    redirect = new URL(callback.redirectUri);
  } catch {
    throw new OuraCredentialError("authorization_exchange_failed");
  }
  if (
    !callback || typeof callback.code !== "string" || !callback.code.trim() ||
    typeof callback.codeVerifier !== "string" || !/^[A-Za-z0-9_-]{43,128}$/.test(callback.codeVerifier) ||
    !Array.isArray(allowedRedirectUris) || !allowedRedirectUris.includes(callback.redirectUri) ||
    redirect.protocol !== "https:" || !redirect.hostname || !!redirect.username || !!redirect.password ||
    !!redirect.search || !!redirect.hash || redirect.toString() !== callback.redirectUri ||
    typeof credentials?.clientId !== "string" || !credentials.clientId.trim() || credentials.clientId.includes(":") ||
    typeof credentials?.clientSecret !== "string" || !credentials.clientSecret.trim()
  ) throw new OuraCredentialError("authorization_exchange_failed");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: callback.code,
    redirect_uri: callback.redirectUri,
    code_verifier: callback.codeVerifier,
  }).toString();
  let data: unknown;
  try {
    const response = await axios.post(TOKEN_URL, body, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64")}`,
      },
      timeout: 10000,
      maxRedirects: 0,
    });
    data = response.data;
  } catch {
    // Axios errors can retain the form body and Basic credentials. Never propagate them.
    throw new OuraCredentialError("authorization_exchange_failed");
  }

  const pair = data as Record<string, unknown> | null;
  if (
    !pair || typeof pair !== "object" || Array.isArray(pair) ||
    typeof pair.token_type !== "string" || pair.token_type.toLowerCase() !== "bearer" ||
    typeof pair.access_token !== "string" || !pair.access_token.trim() ||
    typeof pair.refresh_token !== "string" || !pair.refresh_token.trim() ||
    typeof pair.expires_in !== "number" || !Number.isFinite(pair.expires_in) || pair.expires_in <= 60
  ) throw new OuraCredentialError("invalid_replacement");

  let receivedAt: number;
  try {
    receivedAt = clock().getTime();
  } catch {
    throw new OuraCredentialError("invalid_replacement");
  }
  const expiry = new Date(receivedAt + pair.expires_in * 1000);
  if (!Number.isFinite(receivedAt) || !Number.isFinite(expiry.getTime())) throw new OuraCredentialError("invalid_replacement");
  return { accessToken: pair.access_token, refreshToken: pair.refresh_token, expiresAt: expiry.toISOString() };
}

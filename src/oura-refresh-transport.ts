/* Unwired transport: no callback, private store, or scheduled-template integration. */
import axios from "axios";
import { OuraCredentialError, OuraTokens } from "./oura-credential-broker";

const TOKEN_URL = "https://api.ouraring.com/oauth/token";

interface OuraClientCredentials {
  clientId: string;
  clientSecret: string;
}

/** One exchange only: a timeout may have consumed Oura's single-use refresh token. */
export async function refreshOuraTokens(
  refreshToken: string,
  credentials: OuraClientCredentials,
  clock: () => Date = () => new Date()
): Promise<OuraTokens> {
  if (
    typeof refreshToken !== "string" || !refreshToken.trim() ||
    typeof credentials?.clientId !== "string" || !credentials.clientId.trim() || credentials.clientId.includes(":") ||
    typeof credentials?.clientSecret !== "string" || !credentials.clientSecret.trim()
  ) throw new OuraCredentialError("refresh_failed");

  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }).toString();
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
    // Do not attach Axios errors: their config may contain the token and Basic credentials.
    throw new OuraCredentialError("refresh_failed");
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
  return {
    accessToken: pair.access_token,
    refreshToken: pair.refresh_token,
    expiresAt: expiry.toISOString(),
  };
}

import { createHash } from "crypto";
import { beginOuraAuthorization, consumeOuraAuthorizationCallback, OuraAuthorizationAttempt, OuraAuthorizationError } from "./oura-authorization";

const config = {
  clientId: "test-client",
  redirectUri: "https://example.test/oura/callback",
  allowedRedirectUris: ["https://example.test/oura/callback"],
  scopes: ["personal", "daily"] as ("personal" | "daily")[],
};
const now = new Date("2026-10-03T12:00:00.000Z");

function callback(attempt: { state: string }, extra = "") {
  return `${config.redirectUri}?code=private-code&scope=personal+daily&state=${attempt.state}${extra}`;
}

function pending(attempt: OuraAuthorizationAttempt, session = "owner-session", issued = now) {
  let available = true;
  const consume = jest.fn(async (sessionId: string, state: string) => {
    if (!available || sessionId !== session || state !== attempt.state) return null;
    available = false;
    return { ...attempt, issuedAt: issued.toISOString() };
  });
  return { consume };
}

async function rejected(call: () => Promise<unknown>, code: string) {
  const error = await call().catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(OuraAuthorizationError);
  expect(error).toMatchObject({ code, message: code });
  expect((error as Error).stack).not.toContain("private-code");
}

function rejectedStart(call: () => unknown, code: string) {
  try {
    call();
    throw new Error("expected rejection");
  } catch (error) {
    expect(error).toBeInstanceOf(OuraAuthorizationError);
    expect(error).toMatchObject({ code, message: code });
  }
}

describe("unwired Oura authorization contract", () => {
  test("requests only selected scopes with fresh state and S256 PKCE", () => {
    const first = beginOuraAuthorization(config);
    const second = beginOuraAuthorization(config);
    const url = new URL(first.url);
    expect(url.origin + url.pathname).toBe("https://cloud.ouraring.com/oauth/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code", client_id: "test-client", redirect_uri: config.redirectUri,
      scope: "personal daily", state: first.state,
      code_challenge: createHash("sha256").update(first.codeVerifier).digest("base64url"),
      code_challenge_method: "S256",
    });
    expect(first.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second.state).not.toBe(first.state);
    expect(second.codeVerifier).not.toBe(first.codeVerifier);
    expect(first.url).not.toContain(first.codeVerifier);
  });

  test("consumes matching owner callback once before exposing code and verifier", async () => {
    const attempt = beginOuraAuthorization(config);
    const store = pending(attempt);
    expect(await consumeOuraAuthorizationCallback(callback(attempt), "owner-session", store, now)).toEqual({
      code: "private-code", codeVerifier: attempt.codeVerifier, redirectUri: config.redirectUri, scopes: ["personal", "daily"],
    });
    expect(store.consume).toHaveBeenCalledWith("owner-session", attempt.state);
    await rejected(() => consumeOuraAuthorizationCallback(callback(attempt), "owner-session", store, now), "invalid_callback");
  });

  test("denial and state mismatch fail closed without exposing provider fields", async () => {
    const attempt = beginOuraAuthorization(config);
    await rejected(() => consumeOuraAuthorizationCallback(`${config.redirectUri}?error=access_denied&state=${attempt.state}`, "owner-session", pending(attempt), now), "authorization_denied");
    await rejected(() => consumeOuraAuthorizationCallback(callback({ state: "other-state" }), "owner-session", pending(attempt), now), "invalid_callback");
  });

  test("rejects redirect substitution, duplicate parameters, fragments, partial consent and userinfo", async () => {
    const attempt = beginOuraAuthorization(config);
    for (const url of [
      callback(attempt).replace("example.test", "evil.test"),
      callback(attempt).replace("/oura/callback", "/oura/callback/"),
      callback(attempt, "&state=duplicated"),
      callback(attempt, "&code=duplicated"),
      callback(attempt) + "#private-code",
      callback(attempt).replace("personal+daily", "personal"),
      callback(attempt).replace("https://", "https://user@"),
    ]) await rejected(() => consumeOuraAuthorizationCallback(url, "owner-session", pending(attempt), now), "invalid_callback");
  });

  test("rejects expired and cross-session attempts before exposing a code", async () => {
    const attempt = beginOuraAuthorization(config);
    await rejected(() => consumeOuraAuthorizationCallback(callback(attempt), "other-session", pending(attempt), now), "invalid_callback");
    await rejected(() => consumeOuraAuthorizationCallback(callback(attempt), "owner-session", pending(attempt, "owner-session", new Date("2026-10-03T11:49:59.000Z")), now), "invalid_callback");
  });

  test("refuses unregistered, insecure, empty-scope or unsupported-scope authorization", () => {
    rejectedStart(() => beginOuraAuthorization({ ...config, redirectUri: "https://evil.test/callback" }), "invalid_authorization");
    rejectedStart(() => beginOuraAuthorization({ ...config, redirectUri: "http://example.test/oura/callback", allowedRedirectUris: ["http://example.test/oura/callback"] }), "invalid_authorization");
    rejectedStart(() => beginOuraAuthorization({ ...config, scopes: [] }), "invalid_authorization");
    rejectedStart(() => beginOuraAuthorization({ ...config, scopes: ["email" as "daily"] }), "invalid_authorization");
  });
});

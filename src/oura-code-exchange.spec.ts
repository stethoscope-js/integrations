import axios from "axios";
import { exchangeOuraAuthorizationCode } from "./oura-code-exchange";
import { OuraCredentialError } from "./oura-credential-broker";

const callback = {
  code: "private-authorization-code",
  codeVerifier: "A".repeat(43),
  redirectUri: "https://example.test/oura/callback",
};
const credentials = { clientId: "private-client-id", clientSecret: "private-client-secret" };
const allowedRedirectUris = [callback.redirectUri];
const pair = { token_type: "bearer", access_token: "private-access", refresh_token: "private-refresh", expires_in: 3600 };
const now = new Date("2026-10-04T12:00:00.000Z");

afterEach(() => jest.restoreAllMocks());

describe("unwired Oura authorization-code exchange", () => {
  test("sends one PKCE form exchange to exact allowlisted redirect with Basic auth and returns a private pair", async () => {
    const post = jest.spyOn(axios, "post").mockResolvedValue({ data: pair });
    const next = await exchangeOuraAuthorizationCode(callback, credentials, allowedRedirectUris, () => now);
    expect(next).toEqual({ accessToken: pair.access_token, refreshToken: pair.refresh_token, expiresAt: "2026-10-04T13:00:00.000Z" });
    expect(post).toHaveBeenCalledTimes(1);
    const [url, body, options] = post.mock.calls[0];
    expect(url).toBe("https://api.ouraring.com/oauth/token");
    expect(new URLSearchParams(body as string).toString()).toBe("grant_type=authorization_code&code=private-authorization-code&redirect_uri=https%3A%2F%2Fexample.test%2Foura%2Fcallback&code_verifier=" + "A".repeat(43));
    expect(options).toMatchObject({
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${Buffer.from("private-client-id:private-client-secret").toString("base64")}` },
      timeout: 10000,
      maxRedirects: 0,
    });
  });

  test("rejects redirect substitution or invalid verifier before contacting Oura", async () => {
    const post = jest.spyOn(axios, "post");
    for (const candidate of [
      null as unknown as typeof callback,
      { ...callback, redirectUri: "https://evil.test/callback" },
      { ...callback, redirectUri: "http://example.test/oura/callback" },
      { ...callback, codeVerifier: "too-short" },
      { ...callback, code: "" },
    ]) await expect(exchangeOuraAuthorizationCode(candidate, credentials, allowedRedirectUris, () => now)).rejects.toMatchObject({ code: "authorization_exchange_failed" });
    await expect(exchangeOuraAuthorizationCode(callback, { ...credentials, clientSecret: "" }, allowedRedirectUris, () => now)).rejects.toMatchObject({ code: "authorization_exchange_failed" });
    await expect(exchangeOuraAuthorizationCode(callback, credentials, [], () => now)).rejects.toMatchObject({ code: "authorization_exchange_failed" });
    expect(post).not.toHaveBeenCalled();
  });

  test("fails closed after one ambiguous HTTP error without disclosing code or credentials", async () => {
    const post = jest.spyOn(axios, "post").mockRejectedValue(new Error("private-authorization-code private-client-secret"));
    const error = await exchangeOuraAuthorizationCode(callback, credentials, allowedRedirectUris, () => now).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(OuraCredentialError);
    expect(error).toMatchObject({ code: "authorization_exchange_failed", message: "authorization_exchange_failed" });
    expect((error as Error).stack).not.toContain(callback.code);
    expect((error as Error).stack).not.toContain(credentials.clientSecret);
    expect(post).toHaveBeenCalledTimes(1);
  });

  test.each([
    { ...pair, token_type: "mac" },
    { ...pair, refresh_token: "" },
    { ...pair, expires_in: 30 },
  ])("rejects incomplete token response without exposing provider data", async (data) => {
    jest.spyOn(axios, "post").mockResolvedValue({ data });
    const error = await exchangeOuraAuthorizationCode(callback, credentials, allowedRedirectUris, () => now).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(OuraCredentialError);
    expect(error).toMatchObject({ code: "invalid_replacement", message: "invalid_replacement" });
    expect((error as Error).stack).not.toContain(pair.refresh_token);
  });

  test("starts token lifetime at response receipt rather than request start", async () => {
    let clock = now;
    jest.spyOn(axios, "post").mockImplementation(async () => {
      clock = new Date("2026-10-04T12:00:09.000Z");
      return { data: pair };
    });
    const next = await exchangeOuraAuthorizationCode(callback, credentials, allowedRedirectUris, () => clock);
    expect(next.expiresAt).toBe("2026-10-04T13:00:09.000Z");
  });
});

import axios from "axios";
import { OuraCredentialError } from "./oura-credential-broker";
import { refreshOuraTokens } from "./oura-refresh-transport";

const now = new Date("2026-10-03T00:00:00.000Z");
const credentials = { clientId: "private-client-id", clientSecret: "private-client-secret" };
const tokens = {
  token_type: "bearer",
  access_token: "private-new-access",
  refresh_token: "private-new-refresh",
  expires_in: 3600,
};

afterEach(() => jest.restoreAllMocks());

describe("unwired Oura refresh transport", () => {
  test("posts one form-encoded refresh with Basic auth and returns a validated pair", async () => {
    const post = jest.spyOn(axios, "post").mockResolvedValue({ data: tokens });
    const next = await refreshOuraTokens("private-old-refresh", credentials, () => now);
    expect(next).toEqual({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: "2026-10-03T01:00:00.000Z",
    });
    expect(post).toHaveBeenCalledTimes(1);
    const [url, body, options] = post.mock.calls[0];
    expect(url).toBe("https://api.ouraring.com/oauth/token");
    expect(new URLSearchParams(body as string).toString()).toBe("grant_type=refresh_token&refresh_token=private-old-refresh");
    expect(options).toMatchObject({
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from("private-client-id:private-client-secret").toString("base64")}`,
      },
      timeout: 10000,
      maxRedirects: 0,
    });
  });

  test("fails closed with a fixed code on an ambiguous timeout and never retries", async () => {
    const post = jest.spyOn(axios, "post").mockRejectedValue(new Error("private-old-refresh leaked"));
    const error = await refreshOuraTokens("private-old-refresh", credentials, () => now).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(OuraCredentialError);
    expect(error).toMatchObject({ code: "refresh_failed", message: "refresh_failed" });
    expect((error as Error).stack).not.toContain("private-old-refresh");
    expect(post).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["non-bearer token", { ...tokens, token_type: "mac" }],
    ["missing replacement refresh", { ...tokens, refresh_token: "" }],
    ["nonpositive expiry", { ...tokens, expires_in: 0 }],
    ["non-finite expiry", { ...tokens, expires_in: Infinity }],
    ["too-short expiry for broker safety margin", { ...tokens, expires_in: 30 }],
  ])("rejects %s without exposing response", async (_label, data) => {
    jest.spyOn(axios, "post").mockResolvedValue({ data });
    const error = await refreshOuraTokens("private-old-refresh", credentials, () => now).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(OuraCredentialError);
    expect(error).toMatchObject({ code: "invalid_replacement", message: "invalid_replacement" });
    expect((error as Error).stack).not.toContain("private-new-refresh");
  });

  test("rejects incomplete client credentials without a network request", async () => {
    const post = jest.spyOn(axios, "post");
    await expect(refreshOuraTokens("private-old-refresh", { ...credentials, clientSecret: "" }, () => now)).rejects.toMatchObject({ code: "refresh_failed" });
    expect(post).not.toHaveBeenCalled();
  });

  test("bases expiry on receipt time, not the time the request started", async () => {
    let clock = new Date("2026-10-03T00:00:00.000Z");
    jest.spyOn(axios, "post").mockImplementation(async () => {
      clock = new Date("2026-10-03T00:00:09.000Z");
      return { data: tokens };
    });
    const next = await refreshOuraTokens("private-old-refresh", credentials, () => clock);
    expect(next.expiresAt).toBe("2026-10-03T01:00:09.000Z");
  });
});

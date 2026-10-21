import SpotifyAPI from "spotify-web-api-node";
import dayjs from "dayjs";
import { readFileSync } from "fs";
import { join } from "path";

jest.mock("@anandchowdhary/cosmic", () => ({
  config: jest.fn(),
  cosmicSync: jest.fn(),
}));
jest.mock("spotify-web-api-node", () => jest.fn());
jest.mock("../common", () => ({
  integrationConfig: jest.fn(),
  write: jest.fn(),
}));

const fixture = () =>
  JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "spotify", "recently-played.json"), "utf8"));

describe("Spotify onboarding", () => {
  test("uses a loopback IP callback by default", () => {
    require("./spotify");

    expect(SpotifyAPI).toHaveBeenCalledWith(
      expect.objectContaining({ redirectUri: "http://127.0.0.1:3000/callback" })
    );
  });
});

describe("Spotify listening history v2 contract", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers().setSystemTime(new Date("2026-09-10T12:00:00Z"));
  });
  afterEach(() => jest.useRealTimers());

  test("refreshes before reading history and writes only the cleaned track at its local-day path", async () => {
    const calls: string[] = [];
    const refreshAccessToken = jest.fn(async () => {
      calls.push("refresh");
      return { body: { access_token: "fixture-access-token" } };
    });
    const setAccessToken = jest.fn((_: string) => calls.push("set"));
    const getMyRecentlyPlayedTracks = jest.fn(async () => {
      calls.push("history");
      return fixture();
    });
    const constructor = require("spotify-web-api-node") as jest.Mock;
    constructor.mockImplementation(() => ({ refreshAccessToken, setAccessToken, getMyRecentlyPlayedTracks }));
    const common = require("../common");
    common.integrationConfig.mockImplementation((service: string, key: string) => service === "spotify" && key === "history");
    const Spotify = require("./spotify").default;

    await new Spotify().update();

    const trackDate = dayjs(fixture().body.items[0].played_at).format("YYYY/MM/DD");
    expect(calls).toEqual(["refresh", "set", "history"]);
    expect(setAccessToken).toHaveBeenCalledWith("fixture-access-token");
    expect(getMyRecentlyPlayedTracks).toHaveBeenCalledTimes(1);
    expect(common.write).toHaveBeenCalledTimes(1);
    expect(common.write).toHaveBeenCalledWith(
      `data/spotify-music/daily/${trackDate}/listening-history.json`,
      JSON.stringify(
        [{ name: "Fixture Track", artists: [{ name: "Fixture Artist" }], album: { name: "Fixture Album" } }],
        null,
        2
      )
    );
  });
});

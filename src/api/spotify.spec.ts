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
const libraryAndTopFixture = () =>
  JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "spotify", "library-and-top.json"), "utf8"));

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

describe("Spotify library and top v2 contract", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers().setSystemTime(new Date("2026-09-10T12:00:00Z"));
  });
  afterEach(() => jest.useRealTimers());

  test("writes a cleaned saved track with its original added_at date at today's local-day path", async () => {
    const refreshAccessToken = jest.fn(async () => ({ body: { access_token: "fixture-access-token" } }));
    const setAccessToken = jest.fn();
    const getMySavedTracks = jest.fn(async () => libraryAndTopFixture().library);
    const constructor = require("spotify-web-api-node") as jest.Mock;
    constructor.mockImplementation(() => ({ refreshAccessToken, setAccessToken, getMySavedTracks }));
    const common = require("../common");
    common.integrationConfig.mockImplementation((service: string, key: string) => service === "spotify" && key === "library");
    const Spotify = require("./spotify").default;

    await new Spotify().update();

    expect(setAccessToken).toHaveBeenCalledWith("fixture-access-token");
    expect(getMySavedTracks).toHaveBeenCalledTimes(1);
    expect(common.write.mock.calls).toEqual([
      [
        `data/spotify-music/daily/${dayjs().format("YYYY/MM/DD")}/library.json`,
        JSON.stringify(
          [{
            name: "Fixture Saved Track",
            artists: [{ name: "Fixture Artist" }],
            album: { name: "Fixture Album" },
            date: "2026-09-01T08:30:00.000Z",
          }],
          null,
          2
        ),
      ],
    ]);
  });

  test("requests all three time ranges for tracks and artists and writes cleaned v2 daily files", async () => {
    const refreshAccessToken = jest.fn(async () => ({ body: { access_token: "fixture-access-token" } }));
    const setAccessToken = jest.fn();
    const getMyTopTracks = jest.fn(async () => ({ body: { items: [libraryAndTopFixture().topTrack] } }));
    const getMyTopArtists = jest.fn(async () => ({ body: { items: [libraryAndTopFixture().topArtist] } }));
    const constructor = require("spotify-web-api-node") as jest.Mock;
    constructor.mockImplementation(() => ({ refreshAccessToken, setAccessToken, getMyTopTracks, getMyTopArtists }));
    const common = require("../common");
    common.integrationConfig.mockImplementation((service: string, key: string) =>
      service === "spotify" && (key === "top-tracks" || key === "top-artists")
    );
    const Spotify = require("./spotify").default;

    await new Spotify().update();

    const ranges = ["short_term", "medium_term", "long_term"];
    expect(setAccessToken).toHaveBeenCalledWith("fixture-access-token");
    expect(getMyTopTracks.mock.calls).toEqual(ranges.map((time_range) => [{ time_range }]));
    expect(getMyTopArtists.mock.calls).toEqual(ranges.map((time_range) => [{ time_range }]));
    const date = dayjs().format("YYYY/MM/DD");
    const expectedTrack = JSON.stringify(
      [{ name: "Fixture Top Track", artists: [{ name: "Fixture Artist" }], album: { name: "Fixture Top Album" } }],
      null,
      2
    );
    const expectedArtist = JSON.stringify([{ name: "Fixture Top Artist", id: "fixture-artist-id", genres: ["fixture-genre"] }], null, 2);
    expect(common.write.mock.calls).toEqual([
      ...["short", "medium", "long"].map((range) => [
        `data/spotify-music/daily/${date}/top-tracks/${range}-term.json`,
        expectedTrack,
      ]),
      ...["short", "medium", "long"].map((range) => [
        `data/spotify-music/daily/${date}/top-artists/${range}-term.json`,
        expectedArtist,
      ]),
    ]);
  });
});

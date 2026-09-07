import { config } from "@anandchowdhary/cosmic";
import LastFm from "@toplast/lastfm";
import dayjs from "dayjs";
import { readFileSync } from "fs";
import { join } from "path";
import { integrationConfig, write } from "../common";

jest.mock("@anandchowdhary/cosmic", () => ({
  config: jest.fn(),
  cosmicSync: jest.fn(),
}));
jest.mock("@toplast/lastfm", () => jest.fn());
jest.mock("../common", () => ({
  integrationConfig: jest.fn(),
  write: jest.fn(),
}));

const mockedConfig = config as jest.MockedFunction<typeof config>;
const mockedLastFm = LastFm as unknown as jest.Mock;
const mockedIntegrationConfig = integrationConfig as jest.MockedFunction<typeof integrationConfig>;
const mockedWrite = write as jest.MockedFunction<typeof write>;
const fixture = () => JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "last-fm", "recent-tracks.json"), "utf8"));

describe("Last.fm history", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date("2026-09-07T12:00:00Z"));
    mockedConfig.mockImplementation((key: string) => {
      if (key === "lastfmApiKey") return "fixture-api-key";
      if (key === "lastfmUsername") return "fixture-user";
      return undefined;
    });
    mockedIntegrationConfig.mockImplementation((service: string, key: string) => service === "last-fm" && key === "history");
  });

  afterEach(() => jest.useRealTimers());

  test("requests a configured day and writes the provider response to the v2 history path", async () => {
    const getRecentTracks = jest.fn().mockResolvedValue(fixture());
    mockedLastFm.mockImplementation(() => ({ user: { getRecentTracks } }));
    const LastDotFm = require("./last-fm").default;
    const requestedDate = dayjs();
    const trackDate = dayjs(Number(fixture().recenttracks.track[0].date.uts) * 1000);

    await new LastDotFm().update();

    expect(mockedLastFm).toHaveBeenCalledWith("fixture-api-key");
    expect(getRecentTracks).toHaveBeenNthCalledWith(1, {
      limit: 50,
      page: 1,
      user: "fixture-user",
      from: requestedDate.startOf("day").unix(),
      to: requestedDate.endOf("day").unix(),
    });
    expect(mockedWrite).toHaveBeenCalledWith(
      `data/last-fm-music/daily/${trackDate.format("YYYY/MM/DD")}/listening-history.json`,
      JSON.stringify(fixture().recenttracks.track, null, 2)
    );
  });
});

import { config } from "@anandchowdhary/cosmic";
import axios from "axios";
import { readFileSync } from "fs";
import { join } from "path";
import { integrationConfig, write } from "../common";
import OuraRing from "./oura-ring";

jest.mock("axios");
jest.mock("@anandchowdhary/cosmic", () => ({
  config: jest.fn(),
  cosmicSync: jest.fn(),
}));
jest.mock("../common", () => ({
  integrationConfig: jest.fn(),
  write: jest.fn(),
}));

const mockedConfig = config as jest.MockedFunction<typeof config>;
const mockedGet = axios.get as jest.MockedFunction<typeof axios.get>;
const mockedIntegrationConfig = integrationConfig as jest.MockedFunction<typeof integrationConfig>;
const mockedWrite = write as jest.MockedFunction<typeof write>;

const fixture = (name: string) =>
  JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "oura-v2", `${name}.json`), "utf8"));

describe("OuraRing V2", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date("2026-09-02T12:00:00Z"));
    mockedConfig.mockImplementation((key: string) =>
      key === "ouraAccessToken" ? "fixture-oauth-access-token" : undefined
    );
    mockedIntegrationConfig.mockReturnValue(true);
    mockedGet.mockImplementation(async (url: string) => {
      if (url.endsWith("/personal_info")) return { data: fixture("personal-info") } as any;
      if (url.endsWith("/daily_activity")) return { data: fixture("daily-activity") } as any;
      if (url.endsWith("/sleep")) return { data: fixture("sleep") } as any;
      if (url.endsWith("/daily_sleep")) return { data: fixture("daily-sleep") } as any;
      if (url.endsWith("/daily_readiness")) return { data: fixture("daily-readiness") } as any;
      throw new Error(`Unexpected Oura URL: ${url}`);
    });
  });

  afterEach(() => jest.useRealTimers());

  test("uses OAuth bearer requests and preserves the configured v2 data paths", async () => {
    await new OuraRing().update();

    const request = {
      headers: { Authorization: "Bearer fixture-oauth-access-token" },
      params: { start_date: "2026-09-02", end_date: "2026-09-02" },
    };
    expect(mockedConfig).toHaveBeenCalledWith("ouraAccessToken");
    expect(mockedGet).toHaveBeenNthCalledWith(
      1,
      "https://api.ouraring.com/v2/usercollection/personal_info",
      { headers: request.headers }
    );
    expect(mockedGet).toHaveBeenNthCalledWith(
      2,
      "https://api.ouraring.com/v2/usercollection/daily_sleep",
      request
    );
    expect(mockedGet).toHaveBeenNthCalledWith(
      3,
      "https://api.ouraring.com/v2/usercollection/sleep",
      request
    );
    expect(mockedGet).toHaveBeenNthCalledWith(
      4,
      "https://api.ouraring.com/v2/usercollection/daily_readiness",
      request
    );
    expect(mockedGet).toHaveBeenNthCalledWith(
      5,
      "https://api.ouraring.com/v2/usercollection/daily_activity",
      request
    );
    expect(mockedWrite).toHaveBeenCalledWith(
      "data/oura-weight/daily/2026/09/02/sessions.json",
      JSON.stringify({ weight: 70.5 }, null, 2)
    );
    expect(mockedWrite).toHaveBeenCalledWith(
      "data/oura-sleep/daily/2026/09/02/sessions.json",
      JSON.stringify(
        [
          {
            ...fixture("sleep").data[0],
            rem: 5400,
            awake: 1200,
            deep: 4800,
            duration: 25200,
            light: 15000,
            score: 89,
          },
        ],
        null,
        2
      )
    );
    expect(mockedWrite).toHaveBeenCalledWith(
      "data/oura-readiness/daily/2026/09/02/sessions.json",
      JSON.stringify(
        [
          {
            ...fixture("daily-readiness").data[0],
            score_activity_balance: 77,
            score_hrv_balance: 79,
          },
        ],
        null,
        2
      )
    );
    expect(mockedWrite).toHaveBeenCalledWith(
      "data/oura-activity/daily/2026/09/02/sessions.json",
      JSON.stringify(
        [
          {
            ...fixture("daily-activity").data[0],
            cal_active: 412,
            cal_total: 2011,
            total: 3600,
          },
        ],
        null,
        2
      )
    );
  });
});

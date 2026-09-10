import { config } from "@anandchowdhary/cosmic";
import dayjs from "dayjs";
import { readFileSync } from "fs";
import { join } from "path";
import { WakaTimeClient } from "wakatime-client";
import { integrationConfig, write } from "../common";

jest.mock("@anandchowdhary/cosmic", () => ({
  config: jest.fn(),
  cosmicSync: jest.fn(),
}));
jest.mock("wakatime-client", () => ({ WakaTimeClient: jest.fn() }));
jest.mock("../common", () => ({
  integrationConfig: jest.fn(),
  write: jest.fn(),
}));

const mockedConfig = config as jest.MockedFunction<typeof config>;
const mockedWakaTimeClient = WakaTimeClient as unknown as jest.Mock;
const mockedIntegrationConfig = integrationConfig as jest.MockedFunction<typeof integrationConfig>;
const mockedWrite = write as jest.MockedFunction<typeof write>;
const fixture = () => JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "wakatime", "daily-summary.json"), "utf8"));

describe("WakaTime daily summary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date("2026-09-10T12:00:00Z"));
    mockedConfig.mockImplementation((key: string) => (key === "wakatimeApiKey" ? "fixture-api-key" : undefined));
    mockedIntegrationConfig.mockImplementation((service: string, key: string) => service === "wakatime" && key === "summary");
    mockedWakaTimeClient.mockImplementation(() => ({ getMySummary: jest.fn().mockResolvedValue(fixture()) }));
  });

  afterEach(() => jest.useRealTimers());

  test("requests configured days and writes the provider response to the v2 path", async () => {
    const Wakatime = require("./wakatime").default;
    const requestedDate = dayjs();
    const v2DatePath = dayjs(fixture().start).format("YYYY/MM/DD");

    await new Wakatime().update();

    const client = mockedWakaTimeClient.mock.results[0].value;
    expect(mockedConfig).toHaveBeenCalledWith("wakatimeApiKey");
    expect(mockedWakaTimeClient).toHaveBeenCalledWith("fixture-api-key");
    expect(client.getMySummary).toHaveBeenNthCalledWith(1, {
      dateRange: {
        startDate: requestedDate.format("YYYY-MM-DD"),
        endDate: requestedDate.format("YYYY-MM-DD"),
      },
    });
    expect(client.getMySummary).toHaveBeenNthCalledWith(5, {
      dateRange: {
        startDate: requestedDate.subtract(4, "day").format("YYYY-MM-DD"),
        endDate: requestedDate.subtract(4, "day").format("YYYY-MM-DD"),
      },
    });
    expect(client.getMySummary).toHaveBeenCalledTimes(5);
    expect(mockedWrite).toHaveBeenNthCalledWith(
      1,
      `data/wakatime-time-tracking/daily/${v2DatePath}/daily-summary.json`,
      JSON.stringify(fixture().data, null, 2)
    );
  });
});

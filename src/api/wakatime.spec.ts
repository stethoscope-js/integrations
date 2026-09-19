import { config } from "@anandchowdhary/cosmic";
import axios from "axios";
import dayjs from "dayjs";
import { readFileSync } from "fs";
import { join } from "path";
import { integrationConfig, write } from "../common";

jest.mock("@anandchowdhary/cosmic", () => ({
  config: jest.fn(),
  cosmicSync: jest.fn(),
}));
jest.mock("axios");
jest.mock("../common", () => ({
  integrationConfig: jest.fn(),
  write: jest.fn(),
}));

const mockedConfig = config as jest.MockedFunction<typeof config>;
const mockedGet = axios.get as jest.MockedFunction<typeof axios.get>;
const mockedIntegrationConfig = integrationConfig as jest.MockedFunction<typeof integrationConfig>;
const mockedWrite = write as jest.MockedFunction<typeof write>;
const fixture = () => JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "wakatime", "daily-summary.json"), "utf8"));

describe("WakaTime daily summary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date("2026-09-10T12:00:00Z"));
    mockedConfig.mockImplementation((key: string) => (key === "wakatimeApiKey" ? "fixture-api-key" : undefined));
    mockedIntegrationConfig.mockImplementation((service: string, key: string) => service === "wakatime" && key === "summary");
    mockedGet.mockResolvedValue({ data: fixture() });
  });

  afterEach(() => jest.useRealTimers());

  test("requests configured days and writes the provider response to the v2 path", async () => {
    const Wakatime = require("./wakatime").default;
    const requestedDate = dayjs();
    const v2DatePath = dayjs(fixture().start).format("YYYY/MM/DD");

    await new Wakatime().update();

    expect(mockedConfig).toHaveBeenCalledWith("wakatimeApiKey");
    expect(mockedGet).toHaveBeenNthCalledWith(1, "https://wakatime.com/api/v1/users/current/summaries", {
      headers: { Authorization: `Basic ${Buffer.from("fixture-api-key").toString("base64")}` },
      params: {
        start: requestedDate.format("YYYY-MM-DD"),
        end: requestedDate.format("YYYY-MM-DD"),
        project: null,
        branches: "",
      },
    });
    expect(mockedGet).toHaveBeenNthCalledWith(5, "https://wakatime.com/api/v1/users/current/summaries", {
      headers: { Authorization: `Basic ${Buffer.from("fixture-api-key").toString("base64")}` },
      params: {
        start: requestedDate.subtract(4, "day").format("YYYY-MM-DD"),
        end: requestedDate.subtract(4, "day").format("YYYY-MM-DD"),
        project: null,
        branches: "",
      },
    });
    expect(mockedGet).toHaveBeenCalledTimes(5);
    expect(mockedWrite).toHaveBeenNthCalledWith(
      1,
      `data/wakatime-time-tracking/daily/${v2DatePath}/daily-summary.json`,
      JSON.stringify(fixture().data, null, 2)
    );
  });
});

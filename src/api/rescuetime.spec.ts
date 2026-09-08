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
const fixture = () => JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "rescuetime", "top-categories.json"), "utf8"));

describe("RescueTime top categories", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date("2026-09-08T12:00:00Z"));
    mockedConfig.mockImplementation((key: string) => (key === "rescuetimeApiKey" ? "fixture-api-key" : undefined));
    mockedIntegrationConfig.mockImplementation(
      (service: string, key: string) => service === "rescuetime" && key === "top-categories"
    );
    mockedGet.mockResolvedValue({ data: fixture() } as any);
  });

  afterEach(() => jest.useRealTimers());

  test("requests configured days and writes projected categories to the v2 path", async () => {
    const RescueTime = require("./rescuetime").default;
    const requestedDate = dayjs();
    const formattedDate = requestedDate.format("YYYY-MM-DD");
    const v2DatePath = requestedDate.format("YYYY/MM/DD");

    await new RescueTime().update();

    expect(mockedGet).toHaveBeenNthCalledWith(
      1,
      `https://www.rescuetime.com/anapi/data?format=json&key=fixture-api-key&restrict_kind=category&restrict_begin=${formattedDate}&restrict_end=${formattedDate}`
    );
    expect(mockedGet).toHaveBeenCalledTimes(5);
    expect(mockedWrite).toHaveBeenNthCalledWith(
      1,
      `data/rescuetime-time-tracking/daily/${v2DatePath}/top-categories.json`,
      JSON.stringify(
        [
          {
            Date: 1788825600,
            "Time Spent (seconds)": 3600,
            "Number of People": 1,
            Category: "Fixture Category",
            Productivity: 2,
            "Productivity Percentage": 100,
          },
        ],
        null,
        2
      )
    );
  });
});

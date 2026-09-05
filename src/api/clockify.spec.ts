import axios from "axios";
import { integrationConfig, write } from "../common";
import Clockify from "./clockify";

jest.mock("axios");
jest.mock("@anandchowdhary/cosmic", () => ({
  config: jest.fn((key: string) => {
    const values: Record<string, string> = {
      clockifyApiKey: "fixture-api-key",
      clockifyWorkspaceId: "fixture-workspace",
      clockifyUserId: "fixture-user",
    };
    return values[key];
  }),
  cosmicSync: jest.fn(),
}));
jest.mock("../common", () => ({
  integrationConfig: jest.fn(),
  write: jest.fn(),
}));

const mockedGet = axios.get as jest.MockedFunction<typeof axios.get>;
const mockedIntegrationConfig = integrationConfig as jest.MockedFunction<typeof integrationConfig>;
const mockedWrite = write as jest.MockedFunction<typeof write>;

describe("Clockify", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date("2026-09-05T12:00:00Z"));
    mockedIntegrationConfig.mockImplementation((service: string, key: string) => service === "clockify" && key === "entries");
    mockedGet.mockResolvedValue({ data: [] } as any);
  });

  afterEach(() => jest.useRealTimers());

  test("requests a complete calendar day instead of a zero-width range", async () => {
    await new Clockify().update();

    expect(mockedGet).toHaveBeenNthCalledWith(
      1,
      "https://api.clockify.me/api/v1/workspaces/fixture-workspace/user/fixture-user/time-entries?start=2026-09-05T00%3A00%3A00.000Z&end=2026-09-05T23%3A59%3A59.999Z",
      { headers: { "X-Api-Key": "fixture-api-key" } }
    );
    expect(mockedWrite).not.toHaveBeenCalled();
  });
});

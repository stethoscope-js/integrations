import SpotifyAPI from "spotify-web-api-node";

jest.mock("@anandchowdhary/cosmic", () => ({
  config: jest.fn(),
  cosmicSync: jest.fn(),
}));
jest.mock("spotify-web-api-node", () => jest.fn());

describe("Spotify onboarding", () => {
  test("uses a loopback IP callback by default", () => {
    require("./spotify");

    expect(SpotifyAPI).toHaveBeenCalledWith(
      expect.objectContaining({ redirectUri: "http://127.0.0.1:3000/callback" })
    );
  });
});

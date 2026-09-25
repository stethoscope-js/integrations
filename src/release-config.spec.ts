const config = require("../release.config");

type PluginOptions = Record<string, unknown>;

const pluginOptions = (name: string): PluginOptions | undefined => {
  const plugin = config.plugins.find(
    (entry: string | [string, PluginOptions]) =>
      entry === name || (Array.isArray(entry) && entry[0] === name)
  );

  return Array.isArray(plugin) ? plugin[1] : undefined;
};

describe("release configuration", () => {
  test("preserves gitmoji releases while enabling quiet npm publishing", () => {
    expect(config.branches).toEqual(["master"]);
    expect(pluginOptions("semantic-release-gitmoji")?.releaseRules).toEqual({
      major: { include: [":boom:"] },
      minor: { include: [":sparkles:"] },
      patch: {
        include: [
          ":bug:",
          ":ambulance:",
          ":lock:",
          ":recycle:",
          ":lipstick:",
          ":alien:",
          ":package:",
        ],
      },
    });
    expect(pluginOptions("@semantic-release/npm")).toMatchObject({
      npmPublish: true,
    });
    expect(pluginOptions("@semantic-release/github")).toMatchObject({
      successComment: false,
      failComment: false,
    });
    expect(pluginOptions("@semantic-release/git")).toEqual({
      assets: ["CHANGELOG.md", "package.json", "package-lock.json"],
      message: ":bookmark: Release v${nextRelease.version} [skip ci]",
    });
  });

  test("includes every patch-triggering category in release notes", async () => {
    const gitmoji = require("semantic-release-gitmoji");
    const notes = await gitmoji.generateNotes(
      pluginOptions("semantic-release-gitmoji"),
      {
        commits: [
          {
            hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            subject: ":alien: Update provider contract",
            message: ":alien: Update provider contract",
          },
          {
            hash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            subject: ":package: Update package metadata",
            message: ":package: Update package metadata",
          },
        ],
        options: {
          repositoryUrl: "https://github.com/stethoscope-js/integrations.git",
        },
        lastRelease: {
          version: "2.4.1",
          gitTag: "v2.4.1",
          gitHead: "1111111111111111111111111111111111111111",
        },
        nextRelease: {
          version: "2.4.2",
          gitTag: "v2.4.2",
          gitHead: "2222222222222222222222222222222222222222",
        },
        logger: { log: jest.fn() },
      }
    );

    expect(notes).toContain("### 👽 External API changes");
    expect(notes).toContain("Update provider contract");
    expect(notes).toContain("### 📦 Package updates");
    expect(notes).toContain("Update package metadata");
  });
});

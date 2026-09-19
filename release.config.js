const releaseNotesTemplate = `## v{{nextRelease.version}} ({{datetime "UTC:yyyy-mm-dd"}})

[📝 Release notes](https://github.com/{{owner}}/{{repo}}/releases/tag/v{{nextRelease.version}}){{#if compareUrl}} · [💻 Compare]({{compareUrl}}){{/if}} · [🔖 Tag](https://github.com/{{owner}}/{{repo}}/tree/v{{nextRelease.version}}) · 🗄️ Archive ([zip](https://github.com/{{owner}}/{{repo}}/archive/v{{nextRelease.version}}.zip) · [tar.gz](https://github.com/{{owner}}/{{repo}}/archive/v{{nextRelease.version}}.tar.gz))

{{#with commits}}
{{#if sparkles}}
### ✨ New features

{{#each sparkles}}- {{> commitTemplate}}{{/each}}
{{/if}}

{{#if recycle}}
### ♻️ Updates

{{#each recycle}}- {{> commitTemplate}}{{/each}}
{{/if}}

{{#if lipstick}}
### 💄 Interface changes

{{#each lipstick}}- {{> commitTemplate}}{{/each}}
{{/if}}

{{#if bug}}
### 🐛 Bug fixes

{{#each bug}}- {{> commitTemplate}}{{/each}}
{{/if}}

{{#if ambulance}}
### 🚑 Critical hotfixes

{{#each ambulance}}- {{> commitTemplate}}{{/each}}
{{/if}}

{{#if lock}}
### 🔒 Security issues

{{#each lock}}- {{> commitTemplate}}{{/each}}
{{/if}}

{{#if arrow_up}}
### ⬆️ Dependency updates

{{#each arrow_up}}- {{> commitTemplate}}{{/each}}
{{/if}}

{{#if alien}}
### 👽 External API changes

{{#each alien}}- {{> commitTemplate}}{{/each}}
{{/if}}

{{#if package}}
### 📦 Package updates

{{#each package}}- {{> commitTemplate}}{{/each}}
{{/if}}

{{#if boom}}
### 💥 Breaking changes

{{#each boom}}- {{> commitTemplate}}{{/each}}
{{/if}}
{{/with}}`;

const commitTemplate = `[\`{{commit.short}}\`](https://github.com/{{owner}}/{{repo}}/commit/{{commit.short}}) {{subject}}
{{#if issues}}(Issues:{{#each issues}} [\`{{text}}\`]({{link}}){{/each}}){{/if}}{{#if wip}}{{#each wip}}
- [\`{{commit.short}}\`](https://github.com/{{owner}}/{{repo}}/commit/{{commit.short}}) {{subject}}{{/each}}
{{/if}}`;

module.exports = {
  branches: ["master"],
  plugins: [
    [
      "semantic-release-gitmoji",
      {
        releaseRules: {
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
        },
        releaseNotes: {
          template: releaseNotesTemplate,
          partials: { commitTemplate },
          helpers: {
            datetime: () => new Date().toISOString().slice(0, 10),
          },
          issueResolution: {
            template: "{baseUrl}/{owner}/{repo}/issues/{ref}",
            baseUrl: "https://github.com",
            source: "github.com",
          },
        },
      },
    ],
    [
      "@semantic-release/github",
      {
        successComment: false,
        failComment: false,
      },
    ],
    ["@semantic-release/changelog", { changelogFile: "CHANGELOG.md" }],
    ["@semantic-release/npm", { npmPublish: true }],
    [
      "@semantic-release/git",
      {
        assets: ["CHANGELOG.md", "package.json", "package-lock.json"],
        message: ":bookmark: Release v${nextRelease.version} [skip ci]",
      },
    ],
  ],
};

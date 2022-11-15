#!/usr/bin/env node
import { lstat, pathExists, readdir, readJson, writeFile } from "fs-extra";
import { join } from "path";
import {
  Clockify,
  Goodreads,
  GoogleFit,
  LastFm,
  OuraRing,
  PocketCasts,
  Rescuetime,
  Spotify,
  Twitter,
  Wakatime,
} from "./";
import { sortObject, zero } from "./common";

const INTEGRATIONS = [
  Clockify,
  Goodreads,
  GoogleFit,
  LastFm,
  OuraRing,
  PocketCasts,
  Rescuetime,
  Spotify,
  Twitter,
  Wakatime,
];

const cli = async () => {
  const command = process.argv[2];
  if (command === "migrate") {
    const integration = process.argv[3];
    if (!integration) throw new Error("Provide an integration");
    const start = process.argv[4];
    if (!start) throw new Error("Provide a start date");

    INTEGRATIONS.forEach((ClassName) => {
      const integrationObject = new ClassName();
      if (integration === integrationObject.name) {
        integrationObject.legacy(start);
      }
    });
  } else if (command === "summary") {
    const integration = process.argv[3];
    if (!integration) throw new Error("Provide an integration");

    INTEGRATIONS.forEach(async (ClassName) => {
      const integrationObject = new ClassName();
      if (integration === integrationObject.name) {
        integrationObject.summary();
      }
    });

    const createdIntegrationData = await readdir(join(".", "data"));
    for (const dir of createdIntegrationData) {
      const summary: Record<string, any> = {};
      if (
        (await pathExists(join(".", "data", dir, "summary", "days"))) &&
        (await lstat(join(".", "data", dir, "summary", "days"))).isDirectory()
      ) {
        const years = await readdir(join(".", "data", dir, "summary", "days"));
        for (const year of years) {
          if (
            (await pathExists(join(".", "data", dir, "summary", "days", year))) &&
            (await lstat(join(".", "data", dir, "summary", "days", year))).isDirectory()
          ) {
            const months = await readdir(join(".", "data", dir, "summary", "days", year));
            for (const month of months) {
              const file = join(".", "data", dir, "summary", "days", year, month);
              const data = (await readJson(file)) as Record<string, any>;
              Object.entries(data).forEach(([day, value]) => {
                summary[`${zero(year)}-${zero(month.replace(".json", ""))}-${zero(day)}`] = value;
              });
            }
          }
        }
      }
      if (Object.keys(summary).length)
        await writeFile(
          join(".", "data", dir, "summary", "days.json"),
          JSON.stringify(sortObject(summary), null, 2) + "\n"
        );
    }
  } else {
    throw new Error(`CLI command '${command}' not recognized`);
  }
};

cli();

#!/usr/bin/env node
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
  } else {
    throw new Error(`CLI command '${command}' not recognized`);
  }
};

cli();

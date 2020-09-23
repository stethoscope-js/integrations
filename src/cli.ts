#!/usr/bin/env node
import {
  Spotify,
  Rescuetime,
  LastFm,
  PocketCasts,
  Wakatime,
  Clockify,
  GoogleFit,
  OuraRing,
  Goodreads,
  Twitter,
} from "./";

const cli = async () => {
  const command = process.argv[2];
  if (command === "migrate") {
    const integration = process.argv[3];
    if (!integration) throw new Error("Provide an integration");
    const start = process.argv[4];
    if (!start) throw new Error("Provide a start date");

    [Spotify, Rescuetime, LastFm, PocketCasts, Wakatime, Clockify, GoogleFit, OuraRing, Goodreads, Twitter].forEach(
      (ClassName) => {
        const integrationObject = new ClassName();
        if (integration === integrationObject.name) {
          integrationObject.legacy(start);
        }
      }
    );
  } else {
    throw new Error(`CLI command '${command}' not recognized`);
  }
};

cli();

import { config, cosmicSync } from "@anandchowdhary/cosmic";
import dayjs from "dayjs";
import week from "dayjs/plugin/weekOfYear";
import { readdir, readJson } from "fs-extra";
import { join } from "path";
import PocketCasts from "pocketcasts";
import { integrationConfig, write, zero } from "../common";
import type { Integration } from "../integration";
dayjs.extend(week);
cosmicSync("stethoscope");

const pocketCasts = new PocketCasts(
  config("pocketCastsUsername") || "example",
  config("pocketCastsPassword") || "example"
);

export default class PocketCastsI implements Integration {
  name = "pocket-casts";
  cli = {};

  async update() {
    console.log("Pocket Casts: Starting...");
    await pocketCasts.login();

    if (integrationConfig("pocket-casts").library) {
      const podcasts = (await pocketCasts.getList()).podcasts;
      await write(join(".", "data", "pocket-casts-podcasts", "library.json"), JSON.stringify(podcasts, null, 2));
      console.log("Pocket Casts: Added library");
    }

    if (integrationConfig("pocket-casts").history) {
      let items: Episode[] = [];
      try {
        const years = await readdir(join(".", "data", "pocket-casts-podcasts", "daily"));
        const months = await readdir(
          join(".", "data", "pocket-casts-podcasts", "daily", zero(Math.max(...years.map(parseInt)).toString()))
        );
        const days = await readdir(
          join(
            ".",
            "data",
            "pocket-casts-podcasts",
            "daily",
            zero(Math.max(...years.map(parseInt)).toString()),
            zero(Math.max(...months.map(parseInt)).toString())
          )
        );
        items = await readJson(
          join(
            ".",
            "data",
            "pocket-casts-podcasts",
            "daily",
            zero(Math.max(...years.map(parseInt)).toString()),
            zero(Math.max(...months.map(parseInt)).toString()),
            zero(Math.max(...days.map(parseInt)).toString()),
            "listening-history.json"
          )
        );
      } catch (error) {}
      const history = await pocketCasts.getHistory();
      const newEpisodes: Episode[] = [];
      for (let episode of history.episodes) {
        if (items.find((item) => item.uuid === episode.uuid)) break;
        newEpisodes.push(episode);
      }
      const date = dayjs();
      const year = date.format("YYYY");
      const month = date.format("MM");
      const day = date.format("DD");
      await write(
        join(".", "data", "pocket-casts-podcasts", "daily", year, month, day, "listening-history.json"),
        JSON.stringify(newEpisodes, null, 2)
      );
      console.log(`Pocket Casts: Added ${newEpisodes.length} new episodes`);
    }

    console.log("Pocket Casts: Completed");
  }
  async legacy() {}
  async summary() {}
}

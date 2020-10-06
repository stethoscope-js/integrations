import { config, cosmicSync } from "@anandchowdhary/cosmic";
import LastFm from "@toplast/lastfm";
import { ITrack } from "@toplast/lastfm/lib/common/common.interface";
import dayjs from "dayjs";
import week from "dayjs/plugin/weekOfYear";
import { join } from "path";
import { integrationConfig, write } from "../common";
import type { Integration } from "../integration";
dayjs.extend(week);
cosmicSync("stethoscope");

const lastFm = new LastFm(config("lastfmApiKey") || "example");

const fetchTracks = async (date: Date, page = 1) => {
  const LIMIT = 50;
  const tracks = await lastFm.user.getRecentTracks({
    limit: LIMIT,
    page,
    user: config("lastfmUsername"),
    from: dayjs(date).startOf("day").unix(),
    to: dayjs(date).endOf("day").unix(),
  });
  if (tracks.recenttracks.track.length === LIMIT) {
    const moreTracks = await fetchTracks(date, page + 1);
    tracks.recenttracks.track.push(...moreTracks.recenttracks.track);
  }
  return tracks;
};

const getLastFmTracks = async (date: Date, page = 1) => {
  if (integrationConfig("last-fm", "history")) {
    console.log("Last.fm: Fetching tracks for", dayjs(date).format("YYYY-MM-DD"));
    const tracks = await fetchTracks(date, page);
    const itemsByDate: { [index: string]: ITrack[] } = {};
    for await (const item of tracks.recenttracks.track) {
      const date = dayjs(Number((item.date || {}).uts) * 1000);
      const year = date.format("YYYY");
      const month = date.format("MM");
      const day = date.format("DD");
      itemsByDate[`${year}/${month}/${day}`] = itemsByDate[`${year}/${month}/${day}`] || [];
      itemsByDate[`${year}/${month}/${day}`].push(item);
    }
    for await (const key of Object.keys(itemsByDate)) {
      await write(
        join(".", "data", "last-fm-music", "daily", key, "listening-history.json"),
        JSON.stringify(itemsByDate[key], null, 2)
      );
    }
  }
};

export default class LastDotFm implements Integration {
  name = "last-fm";
  cli = {};

  async update() {
    console.log("Last.fm: Starting...");
    const date = dayjs();
    for await (const day of [0, 1, 2, 3, 4]) {
      await getLastFmTracks(dayjs().subtract(day, "day").toDate());
      console.log("Last.fm: Added data");
    }
    console.log("Last.fm: Added daily summaries");

    if (integrationConfig("last-fm", "top-albums")) {
      const topAlbumsWeekly = await lastFm.user.getTopAlbums({
        user: config("lastfmUsername"),
        period: "7day",
        limit: 20,
      });
      console.log("Last.fm: Added 7-day top albums");
      await write(
        join(".", "data", "last-fm-music", "weekly", "top-albums", date.format("YYYY"), `${date.week()}.json`),
        JSON.stringify(topAlbumsWeekly.topalbums.album, null, 2)
      );
    }

    if (integrationConfig("last-fm", "top-tracks")) {
      const topTracksWeekly = await lastFm.user.getTopTracks({
        user: config("lastfmUsername"),
        period: "7day",
        limit: 20,
      });
      console.log("Last.fm: Added 7-day top tracks");
      await write(
        join(".", "data", "last-fm-music", "weekly", "top-tracks", date.format("YYYY"), `${date.week()}.json`),
        JSON.stringify(topTracksWeekly.toptracks.track, null, 2)
      );
    }

    if (integrationConfig("last-fm", "top-artists")) {
      const topArtistsWeekly = await lastFm.user.getTopArtists({
        user: config("lastfmUsername"),
        period: "7day",
        limit: 20,
      });
      console.log("Last.fm: Added 7-day top artists");
      await write(
        join(".", "data", "last-fm-music", "weekly", "top-artists", date.format("YYYY"), `${date.week()}.json`),
        JSON.stringify(topArtistsWeekly.topartists.artist, null, 2)
      );
    }

    if (integrationConfig("last-fm", "top-albums")) {
      const topAlbumsMonthly = await lastFm.user.getTopAlbums({
        user: config("lastfmUsername"),
        period: "1month",
        limit: 20,
      });
      console.log("Last.fm: Added 1-month top albums");
      await write(
        join(".", "data", "last-fm-music", "monthly", "top-albums", date.format("YYYY"), `${date.format("MM")}.json`),
        JSON.stringify(topAlbumsMonthly.topalbums.album, null, 2)
      );
    }

    if (integrationConfig("last-fm", "top-tracks")) {
      const topTracksMonthly = await lastFm.user.getTopTracks({
        user: config("lastfmUsername"),
        period: "1month",
        limit: 20,
      });
      console.log("Last.fm: Added 1-month top tracks");
      await write(
        join(".", "data", "last-fm-music", "monthly", "top-tracks", date.format("YYYY"), `${date.format("MM")}.json`),
        JSON.stringify(topTracksMonthly.toptracks.track, null, 2)
      );
    }

    if (integrationConfig("last-fm", "top-artists")) {
      const topArtistsMonthly = await lastFm.user.getTopArtists({
        user: config("lastfmUsername"),
        period: "1month",
        limit: 20,
      });
      console.log("Last.fm: Added 1-month top artists");
      await write(
        join(".", "data", "last-fm-music", "monthly", "top-artists", date.format("YYYY"), `${date.format("MM")}.json`),
        JSON.stringify(topArtistsMonthly.topartists.artist, null, 2)
      );
    }

    if (integrationConfig("last-fm", "top-albums")) {
      const topAlbumsYearly = await lastFm.user.getTopAlbums({
        user: config("lastfmUsername"),
        period: "12month",
        limit: 20,
      });
      console.log("Last.fm: Added 1-year top albums");
      await write(
        join(".", "data", "last-fm-music", "yearly", "top-albums", `${date.format("YYYY")}.json`),
        JSON.stringify(topAlbumsYearly.topalbums.album, null, 2)
      );
    }

    if (integrationConfig("last-fm", "top-tracks")) {
      const topTracksYearly = await lastFm.user.getTopTracks({
        user: config("lastfmUsername"),
        period: "12month",
        limit: 20,
      });
      console.log("Last.fm: Added 1-year top tracks");
      await write(
        join(".", "data", "last-fm-music", "yearly", "top-tracks", `${date.format("YYYY")}.json`),
        JSON.stringify(topTracksYearly.toptracks.track, null, 2)
      );
    }

    if (integrationConfig("last-fm", "top-artists")) {
      const topArtistsYearly = await lastFm.user.getTopArtists({
        user: config("lastfmUsername"),
        period: "12month",
        limit: 20,
      });
      console.log("Last.fm: Added 1-year top artists");
      await write(
        join(".", "data", "last-fm-music", "yearly", "top-artists", `${date.format("YYYY")}.json`),
        JSON.stringify(topArtistsYearly.topartists.artist, null, 2)
      );
    }

    console.log("Last.fm: Completed");
  }
  async legacy(start: string) {
    const startDate = dayjs(start);
    for await (const count of [...Array(dayjs().diff(startDate, "day")).keys()]) {
      const date = dayjs(startDate).add(count, "day");
      await getLastFmTracks(date.toDate());
    }
    console.log("Done!");
  }
  async summary() {}
}

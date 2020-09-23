import { config, cosmicSync } from "@anandchowdhary/cosmic";
import dayjs from "dayjs";
import week from "dayjs/plugin/weekOfYear";
import { lstat, pathExists, readdir, readJson } from "fs-extra";
import { join } from "path";
import Twitter from "twitter-lite";
import { integrationConfig, write } from "../common";
import type { Integration } from "../integration";

dayjs.extend(week);
cosmicSync("stethoscope");

const client = new Twitter({
  consumer_key: config("twitterApiKey") || "",
  consumer_secret: config("twitterApiSecretKey") || "",
  access_token_key: config("twitterAccessToken") || "",
  access_token_secret: config("twitterAccessTokenSecret") || "",
});

interface Tweet {
  created_at: string;
  id_string: string;
  text: string;
}

const getRecentTweets = async (count: number = 100) => {
  if (integrationConfig("twitter").tweets) {
    const response: Array<Tweet> = await client.get("statuses/user_timeline", {
      screen_name: config("twitterScreenName") || "",
      count,
    });
    const itemsByDate: { [index: string]: Tweet[] } = {};
    for await (const item of response) {
      const date = dayjs(item.created_at);
      const year = date.format("YYYY");
      const month = date.format("MM");
      const day = date.format("DD");
      itemsByDate[`${year}/${month}/${day}`] = itemsByDate[`${year}/${month}/${day}`] || [];
      itemsByDate[`${year}/${month}/${day}`].push(item);
    }
    for await (const key of Object.keys(itemsByDate)) {
      await write(
        join(".", "data", "twitter-tweets", "daily", key, "tweets.json"),
        JSON.stringify(itemsByDate[key], null, 2)
      );
    }
  }

  if (integrationConfig("twitter").likes) {
    const response: Array<Tweet> = await client.get("favorites/list", {
      screen_name: config("twitterScreenName") || "",
      count,
    });
    const itemsByDate: { [index: string]: Tweet[] } = {};
    for await (const item of response) {
      const date = dayjs(item.created_at);
      const year = date.format("YYYY");
      const month = date.format("MM");
      const day = date.format("DD");
      itemsByDate[`${year}/${month}/${day}`] = itemsByDate[`${year}/${month}/${day}`] || [];
      itemsByDate[`${year}/${month}/${day}`].push(item);
    }
    for await (const key of Object.keys(itemsByDate)) {
      await write(
        join(".", "data", "twitter-likes", "daily", key, "likes.json"),
        JSON.stringify(itemsByDate[key], null, 2)
      );
    }
  }
};

export default class TwitterI implements Integration {
  name = "twitter";
  cli = {};

  async update() {
    console.log("Twitter: Starting...");
    await getRecentTweets();
    console.log("Twitter: Added data");
    console.log("Twitter: Added daily summaries");
  }
  async legacy() {}
  async summary() {
    for await (const typeName of ["twitter-tweets", "twitter-likes"]) {
      if (
        (await pathExists(join(".", "data", typeName, "daily"))) &&
        (await lstat(join(".", "data", typeName, "daily"))).isDirectory()
      ) {
        const years = (await readdir(join(".", "data", typeName, "daily"))).filter((i) => /^\d+$/.test(i));
        const yearData: { [index: string]: number } = {};
        const weeklyData: {
          [index: string]: {
            [index: string]: { [index: string]: number };
          };
        } = {};
        for await (const year of years) {
          let yearlySum = 0;
          const monthlyData: { [index: string]: number } = {};
          [...Array(13).keys()].slice(1).forEach((val) => (monthlyData[val.toString()] = 0));
          const months = (await readdir(join(".", "data", typeName, "daily", year))).filter((i) => /^\d+$/.test(i));
          for await (const month of months) {
            let monthlySum = 0;
            const dailyData: { [index: string]: number } = {};
            [...Array(dayjs(`${year}-${month}-10`).daysInMonth()).keys()]
              .slice(1)
              .forEach((val) => (dailyData[val.toString()] = 0));
            const days = (await readdir(join(".", "data", typeName, "daily", year, month))).filter((i) =>
              /^\d+$/.test(i)
            );
            for await (const day of days) {
              let json = await readJson(
                join(".", "data", typeName, "daily", year, month, day, `${typeName.split("-").pop()}.json`)
              );
              let dailySum = json.length;
              if (dailySum) dailyData[parseInt(day)] = dailySum;
              monthlySum += dailySum;
              yearlySum += dailySum;
              Object.keys(dailyData).forEach((key) => {
                const weekNumber = dayjs(`${year}-${month}-${key}`).week();
                weeklyData[year] = weeklyData[year] || {};
                weeklyData[year][weekNumber] = weeklyData[year][weekNumber] || {};
                weeklyData[year][weekNumber][`${year}-${month}-${key}`] = dailyData[key];
              });
            }
            if (Object.keys(dailyData).length)
              await write(
                join(".", "data", typeName, "summary", "days", year, `${month}.json`),
                JSON.stringify(dailyData, null, 2)
              );
            if (monthlySum) monthlyData[parseInt(month)] = monthlySum;
          }
          if (Object.keys(monthlyData).length)
            await write(
              join(".", "data", typeName, "summary", "months", `${year}.json`),
              JSON.stringify(monthlyData, null, 2)
            );
          if (yearlySum) yearData[parseInt(year)] = yearlySum;
        }
        if (Object.keys(yearData).length)
          await write(join(".", "data", typeName, "summary", "years.json"), JSON.stringify(yearData, null, 2));
        for await (const year of Object.keys(weeklyData)) {
          for await (const week of Object.keys(weeklyData[year])) {
            if (
              Object.keys(weeklyData[year][week]).length &&
              Object.values(weeklyData[year][week]).reduce((a, b) => a + b, 0)
            )
              await write(
                join(".", "data", typeName, "summary", "weeks", year, `${week}.json`),
                JSON.stringify(weeklyData[year][week], null, 2)
              );
          }
        }
      }
    }
  }
}

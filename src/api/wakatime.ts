import { config, cosmicSync } from "@anandchowdhary/cosmic";
import dayjs from "dayjs";
import week from "dayjs/plugin/weekOfYear";
import { lstat, pathExists, readdir, readJson } from "fs-extra";
import { join } from "path";
import { WakaTimeClient } from "wakatime-client";
import { integrationConfig, write } from "../common";
import type { Integration } from "../integration";
dayjs.extend(week);
cosmicSync("stethoscope");

const client = new WakaTimeClient(config("wakatimeApiKey") || "example");

const updateWakatimeDailyData = async (date: Date) => {
  const formattedDate = dayjs(date).format("YYYY-MM-DD");
  console.log("WakaTime: Adding data for", formattedDate);
  if (integrationConfig("wakatime", "summary")) {
    const summary = await client.getMySummary({
      dateRange: {
        startDate: formattedDate,
        endDate: formattedDate,
      },
    });
    if (summary.data.length) {
      const startDate = dayjs(summary.start).format("YYYY/MM/DD");
      await write(
        join(".", "data", "wakatime-time-tracking", "daily", startDate, "daily-summary.json"),
        JSON.stringify(summary.data, null, 2)
      );
    }
  }
};

export default class Wakatime implements Integration {
  name = "wakatime";
  cli = {};

  async update() {
    console.log("WakaTime: Starting...");
    for await (const day of [0, 1, 2, 3, 4]) {
      await updateWakatimeDailyData(dayjs().subtract(day, "day").toDate());
      console.log("WakaTime: Added data");
    }
    console.log("WakaTime: Added daily summaries");
  }
  async legacy(start: string) {
    const startDate = dayjs(start);
    for await (const count of [...Array(dayjs().diff(startDate, "day")).keys()]) {
      const date = dayjs(startDate).add(count, "day");
      await updateWakatimeDailyData(date.toDate());
    }
    console.log("Done!");
  }
  async summary() {
    if (
      (await pathExists(join(".", "data", "wakatime-time-tracking", "daily"))) &&
      (await lstat(join(".", "data", "wakatime-time-tracking", "daily"))).isDirectory()
    ) {
      const years = (await readdir(join(".", "data", "wakatime-time-tracking", "daily"))).filter((i) =>
        /^\d+$/.test(i)
      );
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
        const months = (await readdir(join(".", "data", "wakatime-time-tracking", "daily", year))).filter((i) =>
          /^\d+$/.test(i)
        );
        for await (const month of months) {
          let monthlySum = 0;
          const dailyData: { [index: string]: number } = {};
          [...Array(dayjs(`${year}-${month}-10`).daysInMonth()).keys()]
            .slice(1)
            .forEach((val) => (dailyData[val.toString()] = 0));
          const days = (await readdir(join(".", "data", "wakatime-time-tracking", "daily", year, month))).filter((i) =>
            /^\d+$/.test(i)
          );
          for await (const day of days) {
            let json = await readJson(
              join(".", "data", "wakatime-time-tracking", "daily", year, month, day, "daily-summary.json")
            );
            let dailySum = 0;
            if (Array.isArray(json)) {
              json.forEach((record: any) => {
                if (record.grand_total && record.grand_total.total_seconds) {
                  dailySum += record.grand_total.total_seconds;
                }
              });
            }
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
              join(".", "data", "wakatime-time-tracking", "summary", "days", year, `${month}.json`),
              JSON.stringify(dailyData, null, 2)
            );
          if (monthlySum) monthlyData[parseInt(month)] = monthlySum;
        }
        if (Object.keys(monthlyData).length)
          await write(
            join(".", "data", "wakatime-time-tracking", "summary", "months", `${year}.json`),
            JSON.stringify(monthlyData, null, 2)
          );
        if (yearlySum) yearData[parseInt(year)] = yearlySum;
      }
      if (Object.keys(yearData).length)
        await write(
          join(".", "data", "wakatime-time-tracking", "summary", "years.json"),
          JSON.stringify(yearData, null, 2)
        );
      for await (const year of Object.keys(weeklyData)) {
        for await (const week of Object.keys(weeklyData[year])) {
          if (
            Object.keys(weeklyData[year][week]).length &&
            Object.values(weeklyData[year][week]).reduce((a, b) => a + b, 0)
          )
            await write(
              join(".", "data", "wakatime-time-tracking", "summary", "weeks", year, `${week}.json`),
              JSON.stringify(weeklyData[year][week], null, 2)
            );
        }
      }
    }
  }
}

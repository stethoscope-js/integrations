import { config, cosmicSync } from "@anandchowdhary/cosmic";
import axios from "axios";
import dayjs from "dayjs";
import isLeapYear from "dayjs/plugin/isLeapYear";
import isoWeeksInYear from "dayjs/plugin/isoWeeksInYear";
import week from "dayjs/plugin/weekOfYear";
import { lstat, pathExists, readdir, readJson } from "fs-extra";
import { join } from "path";
import { integrationConfig, write } from "../common";
import type { Integration } from "../integration";

dayjs.extend(week);
dayjs.extend(isoWeeksInYear);
dayjs.extend(isLeapYear);
cosmicSync("stethoscope");

interface CategoryData {
  [index: string]: number;
}

const updateOuraDailyData = async (date: Date) => {
  const formattedDate = dayjs(date).format("YYYY-MM-DD");
  if (integrationConfig("oura-ring", "weight")) {
    const {
      data: healthData,
    }: {
      data: {
        age: number;
        weight: number;
        height: number;
        gender: string;
        email: string;
      };
    } = await axios.get(`https://api.ouraring.com/v1/userinfo?access_token=${config("ouraPersonalAccessToken")}`);
    await write(
      join(
        ".",
        "data",
        "oura-weight",
        "daily",
        dayjs(formattedDate).format("YYYY"),
        dayjs(formattedDate).format("MM"),
        dayjs(formattedDate).format("DD"),
        "sessions.json"
      ),
      JSON.stringify({ weight: healthData.weight }, null, 2)
    );
    console.log("Oura: Added summary data");
  }
  if (integrationConfig("oura-ring", "sleep")) {
    const {
      data: sleepData,
    }: {
      data: {
        sleep: Array<{ summary_date: string }>;
      };
    } = await axios.get(
      `https://api.ouraring.com/v1/sleep?start=${formattedDate}&end=${formattedDate}&access_token=${config(
        "ouraPersonalAccessToken"
      )}`
    );
    console.log("Oura: Added sleep data");
    await write(
      join(
        ".",
        "data",
        "oura-sleep",
        "daily",
        dayjs(formattedDate).format("YYYY"),
        dayjs(formattedDate).format("MM"),
        dayjs(formattedDate).format("DD"),
        "sessions.json"
      ),
      JSON.stringify(sleepData.sleep, null, 2)
    );
  }
  if (integrationConfig("oura-ring", "readiness")) {
    const {
      data: readinessData,
    }: {
      data: {
        readiness: Array<{ summary_date: string }>;
      };
    } = await axios.get(
      `https://api.ouraring.com/v1/readiness?start=${formattedDate}&end=${formattedDate}&access_token=${config(
        "ouraPersonalAccessToken"
      )}`
    );
    console.log("Oura: Added readiness data");
    await write(
      join(
        ".",
        "data",
        "oura-readiness",
        "daily",
        dayjs(formattedDate).format("YYYY"),
        dayjs(formattedDate).format("MM"),
        dayjs(formattedDate).format("DD"),
        "sessions.json"
      ),
      JSON.stringify(readinessData.readiness, null, 2)
    );
  }
  if (integrationConfig("oura-ring", "activity")) {
    const {
      data: activityData,
    }: {
      data: {
        activity: Array<{ summary_date: string }>;
      };
    } = await axios.get(
      `https://api.ouraring.com/v1/activity?start=${formattedDate}&end=${formattedDate}&access_token=${config(
        "ouraPersonalAccessToken"
      )}`
    );
    console.log("Oura: Added activity data");
    await write(
      join(
        ".",
        "data",
        "oura-activity",
        "daily",
        dayjs(formattedDate).format("YYYY"),
        dayjs(formattedDate).format("MM"),
        dayjs(formattedDate).format("DD"),
        "sessions.json"
      ),
      JSON.stringify(activityData.activity, null, 2)
    );
  }
};

export default class OuraRing implements Integration {
  name = "oura-ring";
  cli = {};

  async update() {
    console.log("Oura: Starting...");
    for await (const day of [0, 1, 2, 3, 4]) {
      await updateOuraDailyData(dayjs().subtract(day, "day").toDate());
      console.log("Oura: Added data");
    }
    console.log("Oura: Added daily summaries");
  }
  async legacy(start: string) {
    const startDate = dayjs(start);
    for await (const count of [...Array(dayjs().diff(startDate, "day")).keys()]) {
      const date = dayjs(startDate).add(count, "day");
      await updateOuraDailyData(date.toDate());
    }
    console.log("Done!");
  }
  async summary() {
    for await (const category of ["oura-readiness", "oura-activity", "oura-weight", "oura-sleep"]) {
      if (
        (await pathExists(join(".", "data", category, "daily"))) &&
        (await lstat(join(".", "data", category, "daily"))).isDirectory()
      ) {
        for await (const file of ["sessions.json"]) {
          const years = (await readdir(join(".", "data", category, "daily"))).filter((i) => /^\d+$/.test(i));
          const yearData: { [index: string]: CategoryData } = {};
          const weeklyData: {
            [index: string]: { [index: string]: { [index: string]: CategoryData } };
          } = {};
          for await (const year of years) {
            let yearlySum: CategoryData = {};
            const monthlyData: { [index: string]: CategoryData } = {};
            [...Array(13).keys()].slice(1).forEach((val) => (monthlyData[val.toString()] = {}));
            const months = (await readdir(join(".", "data", category, "daily", year))).filter((i) => /^\d+$/.test(i));
            for await (const month of months) {
              let monthlySum: CategoryData = {};
              const dailyData: { [index: string]: CategoryData } = {};
              [...Array(dayjs(`${year}-${month}-10`).daysInMonth()).keys()]
                .slice(1)
                .forEach((val) => (dailyData[val.toString()] = {}));
              const days = (await readdir(join(".", "data", category, "daily", year, month))).filter((i) =>
                /^\d+$/.test(i)
              );
              for await (const day of days) {
                let json: any[] = [];
                try {
                  json = await readJson(join(".", "data", category, "daily", year, month, day, file));
                } catch (error) {}
                let dailySum: CategoryData = {};
                if (Array.isArray(json) && json.length) {
                  json.forEach((record: any) => {
                    [
                      "steps",
                      "total",
                      "cal_active",
                      "cal_total",
                      "rem",
                      "awake",
                      "deep",
                      "duration",
                      "efficiency",
                      "light",
                      "score",
                      "score_activity_balance",
                      "score_hrv_balance",
                      "score_previous_day",
                      "score_previous_night",
                      "score_recovery_index",
                      "score_resting_hr",
                      "score_sleep_balance",
                      "score_temperature",
                    ].forEach((dataType) => {
                      if (typeof record[dataType] === "number") {
                        dailySum[dataType] = dailySum[dataType] || 0;
                        dailySum[dataType] += record[dataType];
                      }
                    });
                  });
                } else if (typeof json === "object") {
                  if (typeof (json as any).weight === "number") {
                    dailySum.weight = dailySum.weight || 0;
                    dailySum.weight += (json as any).weight;
                  }
                }
                if (Object.keys(dailySum).length) dailyData[parseInt(day)] = dailySum;
                Object.keys(dailySum).forEach((key) => {
                  monthlySum[key] = monthlySum[key] || 0;
                  monthlySum[key] += dailySum[key];
                  yearlySum[key] = yearlySum[key] || 0;
                  yearlySum[key] += dailySum[key];
                });
              }

              Object.keys(dailyData).forEach((key) => {
                const weekNumber = dayjs(`${year}-${month}-${key}`).week();
                weeklyData[year] = weeklyData[year] || {};
                weeklyData[year][weekNumber] = weeklyData[year][weekNumber] || {};
                weeklyData[year][weekNumber][`${year}-${month}-${key}`] = dailyData[key];
              });

              if (Object.keys(dailyData).length)
                await write(
                  join(".", "data", category, "summary", "days", year, `${month}.json`),
                  JSON.stringify(dailyData, null, 2)
                );
              if (monthlySum) monthlyData[parseInt(month)] = monthlySum;
            }
            if (Object.keys(monthlyData).length)
              await write(
                join(".", "data", category, "summary", "months", `${year}.json`),
                JSON.stringify(monthlyData, null, 2)
              );
            if (yearlySum) yearData[parseInt(year)] = yearlySum;
          }
          if (Object.keys(yearData).length)
            await write(join(".", "data", category, "summary", "years.json"), JSON.stringify(yearData, null, 2));
          for await (const year of Object.keys(weeklyData)) {
            for await (const week of Object.keys(weeklyData[year])) {
              if (
                Object.keys(weeklyData[year][week]).length &&
                Object.values(weeklyData[year][week]).reduce((a, b) => a + Object.keys(b).length, 0)
              )
                await write(
                  join(".", "data", category, "summary", "weeks", year, `${week}.json`),
                  JSON.stringify(weeklyData[year][week], null, 2)
                );
            }
          }
        }
      }
    }
  }
}

import { config, cosmicSync } from "@anandchowdhary/cosmic";
import { ensureFile, writeFile } from "fs-extra";
cosmicSync("stethoscope");

export const integrationConfig = (service: string, key: string) => {
  const configs: { [index: string]: { [index: string]: boolean } } = config("integrations") || {};
  const items = configs[service] || {};
  if (items.all) return true;
  return items[key];
};

export const write = async (name: string, contents: any) => {
  await ensureFile(name);
  await writeFile(name, contents);
};

export const zero = (num: string) => (parseInt(num) > 9 ? num : `0${num}`);

export const sortObject = <T>(o: Record<string, T>) =>
  Object.keys(o)
    .sort()
    .reduce((r, k) => ((r[k] = o[k]), r), {} as Record<string, T>);

import { readJson, writeFile } from "fs-extra";
import { join } from "path";

export const updatePkg = async () => {
  const pkg = await readJson(join(".", "package.json"));
  pkg.publishConfig = { registry: "https://npm.pkg.github.com/" };
  await writeFile(join(".", "package.json"), JSON.stringify(pkg, null, 2) + "\n");
};

updatePkg();

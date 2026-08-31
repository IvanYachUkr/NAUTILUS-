import { readFile } from "node:fs/promises";

const adapterUrl = new URL("./openguessr-adapter.js", import.meta.url);

export default async ({ page }) => {
  const adapterSource = await readFile(adapterUrl, "utf8");
  await page.context().addInitScript({ content: adapterSource });
  await page.evaluate(adapterSource);
};

import { chromium } from "playwright";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = resolve(__dirname, "calibrate-widths.html");

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`file://${htmlPath}`);
  await page.waitForFunction(() => window.__CALIBRATION_DATA__ !== undefined, null, { timeout: 5000 });

  const text = await page.evaluate(() => window.__CALIBRATION_TEXT__);
  console.log(text);

  const data = await page.evaluate(() => window.__CALIBRATION_DATA__);
  console.log("\n=== JSON DATA ===");
  console.log(JSON.stringify(data, null, 2));

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

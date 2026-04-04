import { chromium } from "playwright";
import { createServer } from "http";
import { readFile } from "fs/promises";
import { dirname, resolve, extname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const screenshotPath = resolve(__dirname, "demo-screenshot.png");

const MIME = { ".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript", ".css": "text/css" };

function startServer() {
  return new Promise((ok) => {
    const server = createServer(async (req, res) => {
      const filePath = resolve(rootDir, "." + req.url);
      try {
        const data = await readFile(filePath);
        res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end("Not found");
      }
    });
    server.listen(0, () => ok(server));
  });
}

async function main() {
  const server = await startServer();
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  page.on("pageerror", (err) => console.error("PAGE ERROR:", err.message));
  page.on("console", (msg) => { if (msg.type() === "error") console.error("CONSOLE ERROR:", msg.text()); });
  await page.goto(`http://localhost:${port}/tools/demo-tables.html`);
  await page.waitForFunction(() => window.__DEMO_METRICS__ !== undefined, null, { timeout: 10000 });

  const metrics = await page.evaluate(() => window.__DEMO_METRICS__);
  console.log("=== GLOBAL METRICS ===");
  console.log(`  Avg Score:   ${metrics.avgScore.toFixed(1)}`);
  console.log(`  Avg Drift:   ${metrics.avgDrift.toFixed(2)}px`);
  console.log(`  Worst Drift: ${metrics.worstDrift.toFixed(2)}px`);
  console.log(`  Tables:      ${metrics.tables.length}`);
  console.log("\n=== PER-TABLE ===");
  for (let i = 0; i < metrics.tables.length; i++) {
    const t = metrics.tables[i];
    console.log(`  Table ${i + 1}: score=${t.score.toFixed(1)} meanDrift=${t.meanDrift.toFixed(2)}px worstDrift=${t.worstDrift.toFixed(2)}px`);
  }

  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`\nScreenshot saved to: ${screenshotPath}`);

  await browser.close();
  server.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

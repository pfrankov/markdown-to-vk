import { chromium } from "playwright";
import { createServer } from "http";
import { readFile } from "fs/promises";
import { dirname, resolve, extname } from "path";
import { fileURLToPath } from "url";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import {
  createCanvasTableTransform,
  createMarkdownToVkPipeline,
  tableTransform,
} from "../dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const screenshotPath = resolve(__dirname, "canvas-validation-screenshot.png");

const VK_FONT_FAMILY = "Roboto";
const VK_FONT_SIZE = 15;

// Register Roboto font files BEFORE creating canvas
const fontsDir = resolve(__dirname, "fonts");
GlobalFonts.registerFromPath(resolve(fontsDir, "Roboto-Regular.ttf"), "Roboto");
GlobalFonts.registerFromPath(resolve(fontsDir, "Roboto-Bold.ttf"), "Roboto");
GlobalFonts.registerFromPath(resolve(fontsDir, "Roboto-Italic.ttf"), "Roboto");
GlobalFonts.registerFromPath(resolve(fontsDir, "Roboto-BoldItalic.ttf"), "Roboto");

const TABLES = [
  `| Name | Qty | Price |\n| --- | ---: | --- |\n| A | 12 | _ok_ |\n| B | 3 | 42 |\n| C | 125 | ***draft*** |`,
  `| Left | RightWords | AutoNumbers | Cents |\n| --- | --- | --- | --- |\n| alpha | word | 10 | |\n| beta | tall | 200 | |\n| b | WWW | 3000 | |`,
  `| Narrow | Wide | Digits | Cyrillic | C |\n| --- | --- | --- | --- | --- |\n| aaa | WWWWWW | 111111 | цифры | 3 |\n| iiil | mmmmWW | 42.90 | Юрий | |\n| ООО | ЖШЩОрб | 100000 | укоЕ | |`,
  `| plain | **bold** | *italic* | ***bold+italic*** | Word 1 | Word 2 |\n| --- | --- | --- | --- | --- | --- |\n| test | **test** | *test* | ***test*** | Short | LongerText |\n| abc | **abc** | *abc* | ***abc*** | Hi | W |`,
  `| Icon | Description | Count |\n| --- | --- | ---: |\n| 🔥 | Hot item | 42 |\n| ✨ | Sparkle effect | 1 |\n| 🚀 | Launch ready | 999 |\n| 💡 | Ideas | 7 |`,
  `| API | Status | Info |\n| --- | --- | --- |\n| iii | ok | a |\n| lll | err | bb |\n| fff | warn | ccc |`,
  `| Item | Price | Qty | Total |\n| --- | ---: | ---: | ---: |\n| Widget | $12.50 | 100 | $1,250 |\n| Gadget | €3.99 | 42 | €167.58 |\n| Thing | ₽999 | 5 | ₽4,995 |`,
  `| Имя | Фамилия | Должность |\n| --- | --- | --- |\n| Алексей | Жуков | Программист |\n| Мария | Широкова | Дизайнер |\n| Юрий | Щербаков | Менеджер |`,
];

const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
};

function startServer() {
  return new Promise((ok) => {
    const server = createServer(async (req, res) => {
      const filePath = resolve(rootDir, "." + req.url);
      try {
        const data = await readFile(filePath);
        res.writeHead(200, {
          "Content-Type": MIME[extname(filePath)] || "application/octet-stream",
        });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end("Not found");
      }
    });
    server.listen(0, () => ok(server));
  });
}

function renderTablesWithCanvas() {
  const canvas = createCanvas(1, 1);
  const ctx = canvas.getContext("2d");
  const canvasTransform = createCanvasTableTransform(ctx, {
    fontSize: VK_FONT_SIZE,
    fontFamily: VK_FONT_FAMILY,
  });

  const canvasPipeline = createMarkdownToVkPipeline({
    pipeline: undefined, // use default and swap table
  });

  // Replace tableTransform with canvasTransform in a fresh pipeline
  const idx = canvasPipeline.pipeline.findIndex((t) => t === tableTransform);
  if (idx === -1) throw new Error("tableTransform not found in default pipeline");

  // Rebuild pipeline with canvas transform
  const customPipeline = [...canvasPipeline.pipeline];
  customPipeline[idx] = canvasTransform;
  const pipeline = createMarkdownToVkPipeline({ pipeline: customPipeline });

  return TABLES.map((md) => {
    const chunks = pipeline.render(md);
    return chunks[0] ?? null;
  });
}

async function main() {
  console.log("Rendering tables with @napi-rs/canvas...");
  const canvasChunks = renderTablesWithCanvas();

  console.log("Canvas render complete. Starting browser validation...\n");

  const server = await startServer();
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  page.on("pageerror", (err) => console.error("PAGE ERROR:", err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("CONSOLE ERROR:", msg.text());
  });

  // Inject canvas chunks before page loads the module
  await page.addInitScript((chunks) => {
    window.__CANVAS_CHUNKS__ = chunks;
  }, canvasChunks);

  await page.goto(
    `http://localhost:${port}/tools/validate-canvas.html`,
  );
  await page.waitForFunction(
    () => window.__VALIDATION_RESULT__ !== undefined,
    null,
    { timeout: 15000 },
  );

  const result = await page.evaluate(() => window.__VALIDATION_RESULT__);

  console.log("=== VALIDATION RESULT ===");
  console.log(`  Verdict: ${result.pass ? "✅ PASS" : "❌ FAIL"}`);
  console.log(
    `  Canvas wins: ${result.canvasWins}/${result.totalTables} tables\n`,
  );

  console.log("=== HEURISTIC ===");
  console.log(`  Avg Drift:   ${result.heuristic.avgDrift.toFixed(2)}px`);
  console.log(`  Worst Drift: ${result.heuristic.worstDrift.toFixed(2)}px`);

  console.log("\n=== CANVAS (@napi-rs/canvas) ===");
  console.log(`  Avg Drift:   ${result.canvas.avgDrift.toFixed(2)}px`);
  console.log(`  Worst Drift: ${result.canvas.worstDrift.toFixed(2)}px`);

  console.log("\n=== PER-TABLE COMPARISON ===");
  for (let i = 0; i < result.totalTables; i++) {
    const h = result.heuristic.tables[i];
    const c = result.canvas.tables[i];
    const winner =
      c.meanDrift < h.meanDrift
        ? "canvas"
        : c.meanDrift > h.meanDrift
          ? "heuristic"
          : "tie";
    const icon =
      winner === "canvas" ? "✅" : winner === "heuristic" ? "⚠️" : "🟰";
    console.log(
      `  Table ${i + 1}: heur=${h.meanDrift.toFixed(2)}px canvas=${c.meanDrift.toFixed(2)}px ${icon} ${winner}`,
    );
  }

  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`\nScreenshot: ${screenshotPath}`);

  const driftImprovement =
    ((result.heuristic.avgDrift - result.canvas.avgDrift) /
      result.heuristic.avgDrift) *
    100;
  console.log(
    `\nDrift change: ${driftImprovement >= 0 ? "-" : "+"}${Math.abs(driftImprovement).toFixed(1)}% ${driftImprovement >= 0 ? "(improvement)" : "(regression)"}`,
  );

  await browser.close();
  server.close();

  if (!result.pass) {
    console.error(
      "\n⚠️  Canvas avg drift exceeds heuristic. Needs investigation.",
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

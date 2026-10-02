import { createServer } from "http";
import { dirname, resolve, extname } from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { readDemoFile } from "./read-demo-file.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");

const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".png": "image/png",
};

const server = createServer(async (req, res) => {
  const url = req.url === "/" ? "/tools/demo-tables.html" : req.url;
  try {
    const { filePath, data } = await readDemoFile(rootDir, url);
    res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});

server.listen(0, () => {
  const url = `http://localhost:${server.address().port}`;
  console.log(`Demo server running at ${url}`);
  console.log("Press Ctrl+C to stop\n");

  const platform = process.platform;
  const openCmd = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  exec(`${openCmd} ${url}`);
});

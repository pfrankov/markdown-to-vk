import { readFile, realpath } from "fs/promises";
import { isAbsolute, relative, resolve, sep } from "path";

function assertContained(rootDir, filePath) {
  const fromRoot = relative(rootDir, filePath);
  if (fromRoot === ".." || fromRoot.startsWith(".." + sep) || isAbsolute(fromRoot)) {
    throw new Error("Not found");
  }
}

export async function readDemoFile(rootDir, requestUrl) {
  // Decode once, before resolving, without URL normalization hiding traversal.
  const pathname = decodeURIComponent(requestUrl.split("?", 1)[0]);
  if (!pathname.startsWith("/") || /[\\\0]/u.test(pathname)) {
    throw new Error("Not found");
  }

  const filePath = resolve(rootDir, "." + pathname);
  assertContained(rootDir, filePath);

  const realRoot = await realpath(rootDir);
  const realFile = await realpath(filePath);
  assertContained(realRoot, realFile);

  // Keep the requested extension for MIME lookup, but read the checked target.
  return { filePath, data: await readFile(realFile) };
}

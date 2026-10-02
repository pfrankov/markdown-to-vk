import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readDemoFile } from "../tools/read-demo-file.mjs";

let fixture: string;
let rootDir: string;

beforeAll(async () => {
  fixture = await mkdtemp(join(tmpdir(), "markdown-to-vk-demo-"));
  rootDir = join(fixture, "root");
  for (const directory of ["tools", "dist", "%2e%2e", "..assets"]) {
    await mkdir(join(rootDir, directory), { recursive: true });
  }
  await mkdir(join(fixture, "root-sibling"));
  for (const filename of [
    "tools/demo-tables.html", "tools/canvas-noop.js", "dist/index.js",
    "tools/font.ttf", "tools/image.png", "tools/hello world.txt",
    "tools/привет.txt", "%2e%2e/literal.txt", "..assets/inside.txt",
  ]) {
    await writeFile(join(rootDir, filename), `inside:${filename}`);
  }
  await writeFile(join(fixture, "outside.txt"), "SYNTHETIC_OUTSIDE");
  await writeFile(join(fixture, "root-sibling/outside.txt"), "SYNTHETIC_SIBLING");
  await symlink(join(fixture, "outside.txt"), join(rootDir, "outside-link.txt"));
  await symlink(join(fixture, "root-sibling"), join(rootDir, "outside-dir"), "dir");
  await symlink(join(fixture, "missing.txt"), join(rootDir, "broken-link.txt"));
  await symlink(join(rootDir, "tools/demo-tables.html"), join(rootDir, "inside-link.js"));
  await symlink(join(rootDir, "tools"), join(rootDir, "inside-dir"), "dir");
  await symlink(rootDir, join(fixture, "root-alias"), "dir");
});

afterAll(async () => {
  await rm(fixture, { recursive: true, force: true });
});

describe("demo file containment", () => {
  it.each([
    ["/tools/demo-tables.html", "tools/demo-tables.html"],
    ["/tools/canvas-noop.js", "tools/canvas-noop.js"],
    ["/dist/index.js", "dist/index.js"],
    ["/tools/font.ttf", "tools/font.ttf"],
    ["/tools/image.png", "tools/image.png"],
    ["/tools/hello%20world.txt", "tools/hello world.txt"],
    ["/tools/%D0%BF%D1%80%D0%B8%D0%B2%D0%B5%D1%82.txt", "tools/привет.txt"],
    ["/tools/demo-tables.html?version=1", "tools/demo-tables.html"],
    ["/tools/../dist/index.js", "dist/index.js"],
    ["//tools/demo-tables.html", "tools/demo-tables.html"],
    ["/tools%2fcanvas-noop.js", "tools/canvas-noop.js"],
    ["/%252e%252e/literal.txt", "%2e%2e/literal.txt"],
    ["/..assets/inside.txt", "..assets/inside.txt"],
  ])("reads in-root path %s", async (url, filename) => {
    const result = await readDemoFile(rootDir, url);
    expect(result.filePath).toBe(join(rootDir, filename));
    expect(result.data.toString()).toBe(`inside:${filename}`);
  });

  it.each([
    "/../outside.txt",
    "/../../outside.txt",
    "/tools/../../outside.txt",
    "/%2e%2e/outside.txt",
    "/%2E%2E/outside.txt",
    "/.%2e/outside.txt",
    "/%2e./outside.txt",
    "/%2e%2e%2foutside.txt",
    "/..%2foutside.txt",
    "/../root-sibling/outside.txt",
    "//../outside.txt",
    "/..\\outside.txt",
    "/%2e%2e%5coutside.txt",
    "/tools\\..\\..\\outside.txt",
    "/%5c%5clocalhost%5coutside.txt",
    "/tools/%00demo-tables.html",
    "/tools/demo-tables.html\0",
    "/tools/%",
    "/tools/%2",
    "/tools/%GG",
    "/tools/%C0%AFoutside.txt",
    "/outside-link.txt",
    "/outside-dir/outside.txt",
    "/broken-link.txt",
    "/missing.txt",
    "/%252e%252e/outside.txt",
    "tools/demo-tables.html",
    "",
  ])("rejects invalid or outside path %s", async (url) => {
    await expect(readDemoFile(rootDir, url)).rejects.toThrow();
  });

  it("keeps in-root symlinks and the requested extension", async () => {
    const result = await readDemoFile(rootDir, "/inside-link.js");
    expect(result.filePath).toBe(join(rootDir, "inside-link.js"));
    expect(result.data.toString()).toBe("inside:tools/demo-tables.html");
    const directoryResult = await readDemoFile(rootDir, "/inside-dir/canvas-noop.js");
    expect(directoryResult.data.toString()).toBe("inside:tools/canvas-noop.js");
  });

  it("checks containment relative to the canonical document root", async () => {
    const alias = join(fixture, "root-alias");
    const result = await readDemoFile(alias, "/dist/index.js");
    expect(result.data.toString()).toBe("inside:dist/index.js");
    await expect(readDemoFile(alias, "/outside-link.txt")).rejects.toThrow();
  });
});

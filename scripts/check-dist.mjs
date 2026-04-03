import { readdirSync } from "node:fs";
import { extname } from "node:path";

const SRC_DIR = "src";
const DIST_DIR = "dist";
const SUPPORTED_EXTENSIONS = new Set([".js", ".d.ts"]);

const stripTsExtension = (filename) => filename.slice(0, -3);

const listTopLevelFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();

const sourceFiles = listTopLevelFiles(SRC_DIR).filter((file) => extname(file) === ".ts");
const expectedDistFiles = new Set(
  sourceFiles.flatMap((file) => {
    const base = stripTsExtension(file);
    return [`${base}.js`, `${base}.d.ts`];
  }),
);

const actualDistFiles = listTopLevelFiles(DIST_DIR).filter((file) => {
  return [...SUPPORTED_EXTENSIONS].some((extension) => file.endsWith(extension));
});

const extraFiles = actualDistFiles.filter((file) => !expectedDistFiles.has(file));
const missingFiles = [...expectedDistFiles].filter((file) => !actualDistFiles.includes(file));

if (extraFiles.length > 0 || missingFiles.length > 0) {
  if (extraFiles.length > 0) {
    console.error("Unexpected files in dist:");
    for (const file of extraFiles) {
      console.error(`- ${DIST_DIR}/${file}`);
    }
  }

  if (missingFiles.length > 0) {
    console.error("Missing build artifacts in dist:");
    for (const file of missingFiles) {
      console.error(`- ${DIST_DIR}/${file}`);
    }
  }

  process.exit(1);
}

console.log("dist structure is consistent with src build artifacts.");

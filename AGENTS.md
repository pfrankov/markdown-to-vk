# Markdown-to-VK Agent Guide

## Scope
This repository contains utilities for converting Markdown into VK-compatible plain text and `formatData` entities.

## Durability Rules
- Keep this file focused on durable repository knowledge.
- Do not store secrets, private infrastructure details, exact server addresses, user-specific absolute paths, temporary backup filenames, or one-off rollout outcomes here.
- Do not pin exact dependency versions or test counts unless that exact version/count is the point of the instruction.
- Put machine-specific notes in `AGENTS.local.md` (gitignored and optional).
- Treat `AGENTS.md` as a living operational document: update it whenever repository practices or architecture change in a durable way.
- After substantial work, explicitly review whether `AGENTS.md` should be updated before finishing.

## Source Layout
- `src/` is the single source of truth and must contain TypeScript only.
- `dist/` contains generated JavaScript and declarations produced by the build.
- `dist/` is ignored by git and must be reproducible from `src/` via `npm run build`.
- Do not hand-edit `dist/`; regenerate it with `npm run build`.
- `index.js` is a package entry shim that re-exports from `dist/index.js`.
- Never keep parallel hand-maintained JS and TS implementations in `src/`.
- Relative imports inside `src/*.ts` must use explicit `.js` specifiers to keep emitted ESM valid for Node.
- Package exports:
  - `markdown-to-vk` -> ESM runtime from `dist/index.js`

## Code Map
- `src/types.ts`: public and internal types.
- `src/render-output.ts`: shared rendered-text buffer helpers.
- `src/inline-parser.ts`: inline parser construction and safe rule progression.
- `src/block-renderer.ts`: block rendering loop and fenced-code handling.
- `src/rules-inline.ts`: inline markdown rules.
- `src/rules-block.ts`: block markdown rules except tables.
- `src/rules-block-table.ts`: markdown table parsing and rendering.
- `src/rules-block-utils.ts`: shared helpers for block-rule outputs.
- `src/format-utils.ts`: format item shifting and merging helpers.
- `src/pipeline.ts`: transform wiring, parser/renderer, public runtime functions.
- `src/index.ts`: public API exports.

## Build and Test
- Build: `npm run build`
- Dist consistency check: `npm run check:dist`
- Lint: `npm run lint`
- Tests: `npm test`
- Watch: `npm run test:watch`
- Coverage: `npm run test:coverage`

## Release and Publishing
- npm auto-publish is performed by the GitHub Actions workflow: `.github/workflows/publish-npm.yml`.
- The workflow is triggered by tags matching `v*` (for example, `v1.2.3`).
- The tag version must match `package.json` (`vMAJOR.MINOR.PATCH` <-> `MAJOR.MINOR.PATCH`), otherwise publishing fails.
- When bumping a version, use `npm version`; the version must be updated and match in both `package.json` and `package-lock.json`.
- Before publishing, the workflow runs `npm run build`, `npm run lint`, `npm test`, and `npm pack --dry-run`.
- Publishing requires the repository secret `NPM_TOKEN`.

## Commits
- Commit messages must be written in Russian.
- A commit message should be short and include only key changes, without secondary details.
- Keep only the essential change in the commit message, enough to understand the purpose of the commit.

## CHANGELOG
- The repository uses `CHANGELOG.md`; entries must be written in Russian.
- Versioning follows semver (`MAJOR.MINOR.PATCH`).
- Every version in `CHANGELOG.md` must correspond to a semver release version.
- For each version entry, include only key changes that matter to users when deciding whether to upgrade.

## Maintainability Rules
- Hard limit: code files and test files must stay at or below 500 lines each.
- If a file approaches 500 lines, split it by responsibility before adding new logic.
- Prefer extracting cohesive modules over adding regions/comments to a large file.
- Keep public behavior stable while refactoring; verify with tests after each structural change.
- ESLint enforces cyclomatic complexity with a hard limit of 10 per function.

## README Maintenance
- `README.md` is written in Russian and documents public API, usage examples, and supported syntax.
- After changing public API, exported functions/types, supported markdown features, or CLI/build commands, review `README.md` and update it to match.
- All code examples in `README.md` must produce the documented output when run against the current build.

## AGENTS Maintenance
- Update this file when any of the following changes:
- Source-of-truth layout (for example `src` vs `dist`, build ownership, generated artifacts policy).
- Build/test/coverage commands or thresholds.
- File-size and module-splitting conventions.
- Public API packaging/exports strategy.
- If a change is temporary or machine-specific, put it into `AGENTS.local.md` instead of this file.

## Test Quality Guidelines
- Avoid tautological assertions that do not prove behavior.
- Validate both `text` and `items` output contracts.
- Cover positive, negative, and fallback branches for inline/block rules.
- Keep coverage thresholds at 95% or higher for statements and lines unless explicitly changed by request.

import { createRequire } from "node:module";
import { createMarkdownTableBlockRule } from "./table-layout.js";
import type { TableCellWidthResolver, TablePaddingFn } from "./table-layout.js";
import type { VkInlineParseResult, VkMarkdownBlockTransform } from "./types.js";

export type VkExperimentalCanvasContext = {
  measureText(text: string): { width: number };
  font: string;
};

export type VkExperimentalCanvasTableTransformOptions = {
  fontSize?: number;
  fontFamily?: string;
  emojiWidthEm?: number;
};

type WidthAffectingFormatType = "bold" | "italic";

const DEFAULT_FONT_SIZE = 13;
const DEFAULT_FONT_FAMILY = "sans-serif";
const DEFAULT_EMOJI_WIDTH_EM = 1.23;

const THIN_SPACE = "\u2009";
const SIX_PER_EM_SPACE = "\u2006";
const canvasRequire = createRequire(import.meta.url);

// In Chromium DOM rendering, Unicode space characters have these effective widths
// relative to a regular space, regardless of what napi/Skia measures:
// - Thin space (U+2009): renders as ~0.5 × space (Roboto glyph is half-em)
// - Six-per-em (U+2006): renders as 1.0 × space in DOM (Roboto lacks this glyph,
//   falls back to full space), so the optimizer will not choose it for fine-tuning.
// Passing DOM-correct ratios lets the optimizer avoid erroneous over-padding.
const DOM_THIN_RATIO = 0.5;
const DOM_SIX_PER_EM_RATIO = 1.0;

const EMOJI_RE = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]/gu;

const buildFontString = (
  fontSize: number,
  fontFamily: string,
  bold: boolean,
  italic: boolean,
): string => {
  const parts: string[] = [];
  if (italic) parts.push("italic");
  if (bold) parts.push("bold");
  parts.push(`${fontSize}px`);
  parts.push(fontFamily);
  return parts.join(" ");
};

const isWidthAffectingItem = (
  item: { type: string; offset: number; length: number },
): item is { type: WidthAffectingFormatType; offset: number; length: number } =>
  item.type === "bold" || item.type === "italic";

const collectStyleChangePoints = (
  textLength: number,
  styleItems: { type: WidthAffectingFormatType; offset: number; length: number }[],
): number[] => {
  const points = new Set<number>([0, textLength]);
  for (const item of styleItems) {
    points.add(Math.max(0, item.offset));
    points.add(Math.min(textLength, item.offset + item.length));
  }
  return [...points].sort((a, b) => a - b);
};

const isStyleActive = (
  items: { type: WidthAffectingFormatType; offset: number; length: number }[],
  style: WidthAffectingFormatType,
  start: number,
  end: number,
): boolean =>
  items.some(
    (item) =>
      item.type === style &&
      item.length > 0 &&
      item.offset < end &&
      item.offset + item.length > start,
  );

const countEmoji = (text: string): number => {
  const matches = text.match(EMOJI_RE);
  return matches ? matches.length : 0;
};

const measureStyledText = (
  ctx: VkExperimentalCanvasContext,
  text: string,
  items: readonly { type: string; offset: number; length: number }[],
  fontSize: number,
  fontFamily: string,
  extraBold: boolean,
  emojiWidthPx: number,
): number => {
  if (!text) return 0;

  const styleItems = items.filter(isWidthAffectingItem);
  const changePoints = collectStyleChangePoints(text.length, styleItems);
  let totalWidth = 0;
  let emojiCorrection = 0;

  for (let i = 0; i < changePoints.length - 1; i += 1) {
    const start = changePoints[i];
    const end = changePoints[i + 1];
    if (start >= end) continue;

    const segment = text.slice(start, end);
    const bold = extraBold || isStyleActive(styleItems, "bold", start, end);
    const italic = isStyleActive(styleItems, "italic", start, end);

    ctx.font = buildFontString(fontSize, fontFamily, bold, italic);
    const measured = ctx.measureText(segment).width;
    totalWidth += measured;

    const nEmoji = countEmoji(segment);
    if (nEmoji > 0) {
      const emojiMeasured = nEmoji > 0 ? ctx.measureText("\u{1F525}").width : 0;
      emojiCorrection += nEmoji * (emojiWidthPx - emojiMeasured);
    }
  }

  return totalWidth + Math.max(0, emojiCorrection);
};

const MAX_FINE_CHARS = 3;

const createCanvasPaddingFn = (
  spaceWidth: number,
  thinSpaceWidth: number,
  sixPerEmWidth: number,
): TablePaddingFn => {
  return (paddingWidth: number) => {
    if (paddingWidth <= 0) {
      return { text: "", width: 0 };
    }

    const baseSpaces = Math.floor(paddingWidth / spaceWidth);
    let bestText = " ".repeat(baseSpaces);
    let bestWidth = baseSpaces * spaceWidth;
    let bestError = Math.abs(paddingWidth - bestWidth);

    for (let ds = -1; ds <= 1; ds += 1) {
      const ns = baseSpaces + ds;
      if (ns < 0) continue;
      const nsWidth = ns * spaceWidth;
      if (nsWidth > paddingWidth + spaceWidth) continue;

      for (let nt = 0; nt <= MAX_FINE_CHARS; nt += 1) {
        for (let nx = 0; nx <= MAX_FINE_CHARS; nx += 1) {
          const total = nsWidth + nt * thinSpaceWidth + nx * sixPerEmWidth;
          const error = Math.abs(paddingWidth - total);
          if (error < bestError) {
            bestError = error;
            bestWidth = total;
            bestText =
              " ".repeat(ns) +
              THIN_SPACE.repeat(nt) +
              SIX_PER_EM_SPACE.repeat(nx);
          }
        }
      }
    }

    return { text: bestText, width: bestWidth };
  };
};

const measureSpaceWidth = (
  ctx: VkExperimentalCanvasContext,
  fontSize: number,
  fontFamily: string,
): number => {
  ctx.font = buildFontString(fontSize, fontFamily, false, false);
  return ctx.measureText(" ").width;
};

const createCanvasCellWidthResolver = (
  ctx: VkExperimentalCanvasContext,
  fontSize: number,
  fontFamily: string,
  emojiWidthPx: number,
  normalize: (px: number) => number,
): TableCellWidthResolver => {
  return (cell: VkInlineParseResult, isHeader: boolean): number =>
    normalize(measureStyledText(ctx, cell.text, cell.items, fontSize, fontFamily, isHeader, emojiWidthPx));
};

const buildTransform = (
  ctx: VkExperimentalCanvasContext,
  options: VkExperimentalCanvasTableTransformOptions | undefined,
): VkMarkdownBlockTransform => {
  const fontSize = options?.fontSize ?? DEFAULT_FONT_SIZE;
  const fontFamily = options?.fontFamily ?? DEFAULT_FONT_FAMILY;

  const emojiWidthPx = fontSize * (options?.emojiWidthEm ?? DEFAULT_EMOJI_WIDTH_EM);

  const spaceWidth = measureSpaceWidth(ctx, fontSize, fontFamily);

  const normalize = (px: number): number => px / spaceWidth;

  // Use DOM-correct effective widths so the optimizer avoids erroneous padding:
  // thin space (U+2009) = 0.5 sp in DOM; six-per-em (U+2006) = 1.0 sp (full space fallback),
  // so it is treated as a regular space and never chosen for fine-tuning.
  const paddingFn = createCanvasPaddingFn(
    normalize(spaceWidth),
    DOM_THIN_RATIO,
    DOM_SIX_PER_EM_RATIO,
  );

  const resolveCellWidth = createCanvasCellWidthResolver(
    ctx,
    fontSize,
    fontFamily,
    emojiWidthPx,
    normalize,
  );

  const rule = createMarkdownTableBlockRule(resolveCellWidth, paddingFn);
  return Object.assign(rule, { mode: "block" as const });
};

type CanvasFactory = {
  getContext(contextId: "2d"): VkExperimentalCanvasContext | null;
};

type CanvasModule = {
  createCanvas(width: number, height: number): CanvasFactory;
};

const isMissingModuleError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === "MODULE_NOT_FOUND";

const loadCanvasModule = (): CanvasModule => {
  try {
    return canvasRequire("@napi-rs/canvas") as CanvasModule;
  } catch (error) {
    if (isMissingModuleError(error)) {
      throw new Error(
        "createExperimentalCanvasTableTransform() requires the optional peer dependency @napi-rs/canvas. Install it or pass a custom canvas context.",
        { cause: error as Error },
      );
    }

    throw error;
  }
};

const createDefaultCanvasContext = (): VkExperimentalCanvasContext => {
  const ctx = loadCanvasModule().createCanvas(1, 1).getContext("2d");
  if (ctx == null) {
    throw new Error("createExperimentalCanvasTableTransform() could not create a 2d canvas context.");
  }

  return ctx;
};

const isCanvasContext = (
  value: VkExperimentalCanvasContext | VkExperimentalCanvasTableTransformOptions | undefined,
): value is VkExperimentalCanvasContext => {
  return typeof value === "object" && value !== null && "measureText" in value;
};

export function createExperimentalCanvasTableTransform(
  options?: VkExperimentalCanvasTableTransformOptions,
): VkMarkdownBlockTransform;
export function createExperimentalCanvasTableTransform(
  ctx: VkExperimentalCanvasContext,
  options?: VkExperimentalCanvasTableTransformOptions,
): VkMarkdownBlockTransform;
export function createExperimentalCanvasTableTransform(
  ctxOrOptions?: VkExperimentalCanvasContext | VkExperimentalCanvasTableTransformOptions,
  maybeOptions?: VkExperimentalCanvasTableTransformOptions,
): VkMarkdownBlockTransform {
  let ctx: VkExperimentalCanvasContext;
  let options: VkExperimentalCanvasTableTransformOptions | undefined;

  if (isCanvasContext(ctxOrOptions)) {
    ctx = ctxOrOptions;
    options = maybeOptions;
  } else {
    options = ctxOrOptions;
    ctx = createDefaultCanvasContext();
  }

  return buildTransform(ctx, options);
}

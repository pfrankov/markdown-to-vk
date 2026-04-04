import { createMarkdownTableBlockRule } from "./table-layout.js";
import type { TableCellWidthResolver, TablePaddingFn } from "./table-layout.js";
import type { VkInlineParseResult, VkMarkdownBlockTransform } from "./types.js";

export type VkCanvasContext = {
  measureText(text: string): { width: number };
  font: string;
};

export type VkCanvasTableTransformOptions = {
  fontSize?: number;
  fontFamily?: string;
  emojiWidthEm?: number;
};

type WidthAffectingFormatType = "bold" | "italic";

const DEFAULT_FONT_SIZE = 15;
const DEFAULT_FONT_FAMILY = "sans-serif";
const DEFAULT_EMOJI_WIDTH_EM = 1.27;

const THIN_SPACE = "\u2009";
const SIX_PER_EM_SPACE = "\u2006";

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
  ctx: VkCanvasContext,
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

const measureSpaceWidths = (
  ctx: VkCanvasContext,
  fontSize: number,
  fontFamily: string,
): { spaceWidth: number; thinSpaceWidth: number; sixPerEmWidth: number } => {
  ctx.font = buildFontString(fontSize, fontFamily, false, false);
  return {
    spaceWidth: ctx.measureText(" ").width,
    thinSpaceWidth: ctx.measureText(THIN_SPACE).width,
    sixPerEmWidth: ctx.measureText(SIX_PER_EM_SPACE).width,
  };
};

const createCanvasCellWidthResolver = (
  ctx: VkCanvasContext,
  fontSize: number,
  fontFamily: string,
  emojiWidthPx: number,
  normalize: (px: number) => number,
): TableCellWidthResolver => {
  return (cell: VkInlineParseResult, isHeader: boolean): number =>
    normalize(measureStyledText(ctx, cell.text, cell.items, fontSize, fontFamily, isHeader, emojiWidthPx));
};

export function createCanvasTableTransform(
  ctx: VkCanvasContext,
  options?: VkCanvasTableTransformOptions,
): VkMarkdownBlockTransform {
  const fontSize = options?.fontSize ?? DEFAULT_FONT_SIZE;
  const fontFamily = options?.fontFamily ?? DEFAULT_FONT_FAMILY;

  const emojiWidthPx = fontSize * (options?.emojiWidthEm ?? DEFAULT_EMOJI_WIDTH_EM);

  const { spaceWidth, thinSpaceWidth, sixPerEmWidth } = measureSpaceWidths(
    ctx,
    fontSize,
    fontFamily,
  );

  const normalize = (px: number): number => px / spaceWidth;

  const paddingFn = createCanvasPaddingFn(
    normalize(spaceWidth),
    normalize(thinSpaceWidth),
    normalize(sixPerEmWidth),
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
}

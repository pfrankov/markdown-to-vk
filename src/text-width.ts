import type { VkFormatItem, VkInlineParseResult } from "./types.js";

type WidthAffectingFormatType = "bold" | "italic";

type GlyphClass =
  | "emoji"
  | "cjk"
  | "hangul"
  | "digit"
  | "currency"
  | "narrowPunctuation"
  | "bracket"
  | "dash"
  | "slimLetter"
  | "wideLetter"
  | "upperLetter"
  | "lowerLetter"
  | "wideSymbol"
  | "symbol";

type GraphemeSegment = {
  segment: string;
  start: number;
  end: number;
};

type TextWidthOptions = {
  extraStyles?: readonly WidthAffectingFormatType[];
};

export const TABLE_SPACE_WIDTH_UNITS = 1;

const TAB_WIDTH_UNITS = 4;
const THIN_SPACE_WIDTH = 0.5;
const HAIR_SPACE_WIDTH = 0.25;

const BASE_WIDTHS: Readonly<Record<GlyphClass, number>> = {
  emoji: 4.77,
  cjk: 3.74,
  hangul: 3.26,
  digit: 2.23,
  currency: 2.31,
  narrowPunctuation: 1.21,
  bracket: 1.38,
  dash: 2.16,
  slimLetter: 1.04,
  wideLetter: 3.22,
  upperLetter: 2.54,
  lowerLetter: 2.1,
  wideSymbol: 3.21,
  symbol: 1.82,
};

const BOLD_MULTIPLIERS: Readonly<Record<GlyphClass, number>> = {
  emoji: 1,
  cjk: 1,
  hangul: 1,
  digit: 1.08,
  currency: 1.08,
  narrowPunctuation: 1.15,
  bracket: 1.13,
  dash: 1.06,
  slimLetter: 1.17,
  wideLetter: 1.08,
  upperLetter: 1.05,
  lowerLetter: 1.08,
  wideSymbol: 1.06,
  symbol: 1.07,
};

const ITALIC_MULTIPLIERS: Readonly<Record<GlyphClass, number>> = {
  emoji: 1,
  cjk: 0.97,
  hangul: 1,
  digit: 1,
  currency: 1.08,
  narrowPunctuation: 1.01,
  bracket: 1,
  dash: 0.97,
  slimLetter: 1,
  wideLetter: 1,
  upperLetter: 1,
  lowerLetter: 1,
  wideSymbol: 0.98,
  symbol: 0.99,
};

const GLYPH_BASE_OVERRIDES: Readonly<Record<string, number>> = {
  "1": 1.69,
  r: 1.38,
  "\u0416": 3.78, // Ж
  "\u0428": 3.57, // Ш
  "\u0429": 3.68, // Щ
  "\u042E": 3.77, // Ю
  "\u043C": 2.78, // м
};

const EMOJI_RE = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]/u;
const EMOJI_PRESENTATION_RE = /[\uFE0F\u200D]/u;
const CJK_RE =
  /[\u1100-\u115F\u2329\u232A\u2E80-\u303E\u3040-\uA4CF\uF900-\uFAFF\uFE10-\uFE19\uFE30-\uFE6F\uFF01-\uFF60\uFFE0-\uFFE6]/u;
const HANGUL_RE = /[\uAC00-\uD7A3]/u;
const ZERO_WIDTH_RE = /[\p{Mark}\u200B-\u200D\uFE0E\uFE0F]/gu;

const DIGIT_RE = /[0-9]/u;
const CURRENCY_RE = /[$€₽£¥]/u;
const NARROW_PUNCTUATION_RE = /[.,:;!'"`|]/u;
const BRACKET_RE = /[()[\]{}]/u;
const DASH_RE = /[-_~+=]/u;
const SLIM_LETTER_RE = /[Iiljft]/u;
const WIDE_LETTER_RE = /[MWmwМЖШЩЮЫФжшщюыф]/u;
const LETTER_RE = /[\p{L}]/u;
const UPPERCASE_RE = /[\p{Lu}]/u;
const WIDE_SYMBOL_RE = /[@#%&№]/u;

const GLYPH_CLASSIFIERS: ReadonlyArray<readonly [GlyphClass, (glyph: string) => boolean]> = [
  ["emoji", (glyph) => EMOJI_RE.test(glyph)],
  ["hangul", (glyph) => HANGUL_RE.test(glyph)],
  ["cjk", (glyph) => CJK_RE.test(glyph)],
  ["digit", (glyph) => DIGIT_RE.test(glyph)],
  ["currency", (glyph) => CURRENCY_RE.test(glyph)],
  ["narrowPunctuation", (glyph) => NARROW_PUNCTUATION_RE.test(glyph)],
  ["bracket", (glyph) => BRACKET_RE.test(glyph)],
  ["dash", (glyph) => DASH_RE.test(glyph)],
  ["slimLetter", (glyph) => SLIM_LETTER_RE.test(glyph)],
  ["wideLetter", (glyph) => WIDE_LETTER_RE.test(glyph)],
  ["wideSymbol", (glyph) => WIDE_SYMBOL_RE.test(glyph)],
];

const createSegmenter = (): Intl.Segmenter | null =>
  typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter("ru", { granularity: "grapheme" })
    : null;

const graphemeSegmenter = createSegmenter();

const segmentWithFallback = (text: string): GraphemeSegment[] => {
  let offset = 0;

  return Array.from(text, (segment) => {
    const start = offset;
    offset += segment.length;

    return {
      segment,
      start,
      end: offset,
    };
  });
};

const segmentText = (text: string): GraphemeSegment[] => {
  if (!text) {
    return [];
  }

  if (!graphemeSegmenter) {
    return segmentWithFallback(text);
  }

  return Array.from(graphemeSegmenter.segment(text), ({ segment, index }) => ({
    segment,
    start: index,
    end: index + segment.length,
  }));
};

const stripZeroWidthCodePoints = (value: string): string => value.replace(ZERO_WIDTH_RE, "");

const pickRepresentativeGlyph = (segment: string): string => {
  const visibleText = stripZeroWidthCodePoints(segment);
  return [...visibleText][0] ?? segment;
};

const classifyLetter = (glyph: string): GlyphClass =>
  UPPERCASE_RE.test(glyph) ? "upperLetter" : "lowerLetter";

const classifyGlyph = (segment: string, glyph: string): GlyphClass => {
  if (EMOJI_PRESENTATION_RE.test(segment) && EMOJI_RE.test(segment)) {
    return "emoji";
  }

  for (const [glyphClass, matches] of GLYPH_CLASSIFIERS) {
    if (matches(glyph)) {
      return glyphClass;
    }
  }

  if (LETTER_RE.test(glyph)) {
    return classifyLetter(glyph);
  }

  return "symbol";
};

const isWidthAffectingItem = (
  item: VkFormatItem,
): item is VkFormatItem & { type: WidthAffectingFormatType } =>
  item.type === "bold" || item.type === "italic";

const isStyleActiveInSegment = (
  items: readonly (VkFormatItem & { type: WidthAffectingFormatType })[],
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

const hasExtraStyle = (
  options: TextWidthOptions | undefined,
  style: WidthAffectingFormatType,
): boolean => options?.extraStyles?.includes(style) ?? false;

const applyStyleWidth = (
  baseWidth: number,
  glyphClass: GlyphClass,
  isBold: boolean,
  isItalic: boolean,
): number => {
  let width = baseWidth;

  if (isBold) {
    width *= BOLD_MULTIPLIERS[glyphClass];
  }

  if (isItalic) {
    width *= ITALIC_MULTIPLIERS[glyphClass];
  }

  return width;
};

export const estimateRenderedTextWidth = (
  rendered: VkInlineParseResult,
  options?: TextWidthOptions,
): number => {
  const styleItems = rendered.items.filter(isWidthAffectingItem);

  return segmentText(rendered.text).reduce((sum, { segment, start, end }) => {
    if (segment === " ") {
      return sum + TABLE_SPACE_WIDTH_UNITS;
    }

    if (segment === "\t") {
      return sum + TAB_WIDTH_UNITS;
    }

    if (segment === "\u2009" || segment === "\u202F") {
      return sum + THIN_SPACE_WIDTH;
    }

    if (segment === "\u200A") {
      return sum + HAIR_SPACE_WIDTH;
    }

    const glyph = pickRepresentativeGlyph(segment);
    if (!glyph) {
      return sum;
    }

    const isBold =
      hasExtraStyle(options, "bold") ||
      isStyleActiveInSegment(styleItems, "bold", start, end);
    const isItalic =
      hasExtraStyle(options, "italic") ||
      isStyleActiveInSegment(styleItems, "italic", start, end);
    const glyphClass = classifyGlyph(segment, glyph);
    const baseWidth = GLYPH_BASE_OVERRIDES[glyph] ?? BASE_WIDTHS[glyphClass];

    return sum + applyStyleWidth(baseWidth, glyphClass, isBold, isItalic);
  }, 0);
};

import type { VkFormatItem, VkInlineParseResult } from "./types.js";

type WidthAffectingFormatType = "bold" | "italic";

type GraphemeSegment = {
  segment: string;
  start: number;
  end: number;
};

type TextWidthOptions = {
  extraStyles?: readonly WidthAffectingFormatType[];
};

export const TABLE_SPACE_WIDTH_UNITS = 4;

const DEFAULT_CHAR_WIDTH = 6;
const EMOJI_WIDTH_UNITS = 12;
const FULLWIDTH_CHAR_WIDTH = 11;
const WIDE_CHAR_WIDTH = 9;
const DIGIT_CHAR_WIDTH = 7;
const UPPERCASE_CHAR_WIDTH = 7;
const NARROW_CHAR_WIDTH = 3;
const BRACKET_CHAR_WIDTH = 4;
const DASH_CHAR_WIDTH = 5;

const BOLD_WIDTH_MULTIPLIER = 1.12;
const ITALIC_WIDTH_MULTIPLIER = 1.06;

const EMOJI_RE = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]/u;
const FULLWIDTH_RE =
  /[\u1100-\u115F\u2329\u232A\u2E80-\u303E\u3040-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE10-\uFE19\uFE30-\uFE6F\uFF01-\uFF60\uFFE0-\uFFE6]/u;
const ZERO_WIDTH_RE = /[\p{Mark}\u200B-\u200D\uFE0E\uFE0F]/gu;

const CHAR_WIDTH_RULES: ReadonlyArray<{ pattern: RegExp; width: number }> = [
  { pattern: /[MWmw@#%&ЖШЩЮЫФжшщюыф]/u, width: WIDE_CHAR_WIDTH },
  { pattern: /[ilI1\|'"`.,:;!]/u, width: NARROW_CHAR_WIDTH },
  { pattern: /[()\[\]{}]/u, width: BRACKET_CHAR_WIDTH },
  { pattern: /[-_~]/u, width: DASH_CHAR_WIDTH },
  { pattern: /[0-9]/u, width: DIGIT_CHAR_WIDTH },
  { pattern: /[A-ZА-ЯЁ]/u, width: UPPERCASE_CHAR_WIDTH },
  { pattern: /[a-zа-яё]/u, width: DEFAULT_CHAR_WIDTH },
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

const estimateBaseGraphemeWidth = (segment: string): number => {
  if (segment === " ") {
    return TABLE_SPACE_WIDTH_UNITS;
  }

  if (segment === "\t") {
    return TABLE_SPACE_WIDTH_UNITS * 4;
  }

  if (EMOJI_RE.test(segment)) {
    return EMOJI_WIDTH_UNITS;
  }

  const glyph = pickRepresentativeGlyph(segment);
  if (!glyph) {
    return 0;
  }

  if (FULLWIDTH_RE.test(glyph)) {
    return FULLWIDTH_CHAR_WIDTH;
  }

  const matchedRule = CHAR_WIDTH_RULES.find(({ pattern }) => pattern.test(glyph));
  return matchedRule?.width ?? DEFAULT_CHAR_WIDTH;
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

const applyStyleWidth = (
  baseWidth: number,
  segment: string,
  isBold: boolean,
  isItalic: boolean,
): number => {
  if (baseWidth <= 0 || /^\s+$/u.test(segment)) {
    return baseWidth;
  }

  let width = baseWidth;

  if (isBold) {
    width *= BOLD_WIDTH_MULTIPLIER;
  }

  if (isItalic) {
    width *= ITALIC_WIDTH_MULTIPLIER;
  }

  return width;
};

const hasExtraStyle = (
  options: TextWidthOptions | undefined,
  style: WidthAffectingFormatType,
): boolean => options?.extraStyles?.includes(style) ?? false;

export const estimateRenderedTextWidth = (
  rendered: VkInlineParseResult,
  options?: TextWidthOptions,
): number => {
  const styleItems = rendered.items.filter(isWidthAffectingItem);

  return segmentText(rendered.text).reduce((sum, { segment, start, end }) => {
    const baseWidth = estimateBaseGraphemeWidth(segment);
    const isBold =
      hasExtraStyle(options, "bold") ||
      isStyleActiveInSegment(styleItems, "bold", start, end);
    const isItalic =
      hasExtraStyle(options, "italic") ||
      isStyleActiveInSegment(styleItems, "italic", start, end);

    return sum + applyStyleWidth(baseWidth, segment, isBold, isItalic);
  }, 0);
};

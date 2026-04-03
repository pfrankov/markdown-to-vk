import type {
  VkFormatType,
  VkMarkdownInlineRule,
  VkMarkdownInlineRuleContext,
  VkMarkdownInlineRuleResult,
} from "./types.js";

const isWhitespace = (value: string): boolean => /\s/.test(value);

const isAlphaNum = (value: string): boolean => /[\p{L}\p{N}]/u.test(value);

type StyledFormatType = Exclude<VkFormatType, "url">;

const findClosing = (text: string, marker: string, start: number): number => {
  let index = start;
  while (index < text.length) {
    if (text[index] === "\\") {
      index += 2;
      continue;
    }

    if (text.startsWith(marker, index)) {
      return index;
    }

    index += 1;
  }

  return -1;
};

const findClosingSingleEmphasis = (
  text: string,
  marker: string,
  start: number,
): number => {
  let index = start;
  while (index < text.length) {
    if (text[index] === "\\") {
      index += 2;
      continue;
    }

    if (text[index] !== marker) {
      index += 1;
      continue;
    }

    const prevSame = text[index - 1] === marker;
    const nextSame = text[index + 1] === marker;
    const secondInPair = prevSame && text[index - 2] !== marker;
    if (nextSame || secondInPair) {
      index += 1;
      continue;
    }

    return index;
  }

  return -1;
};

const shouldRenderLiteralMarker = (
  context: VkMarkdownInlineRuleContext,
  marker: string,
): boolean => {
  const nextChar = context.source[context.index + marker.length] ?? "";
  return !nextChar || isWhitespace(nextChar);
};

const findValidMarkerClose = (
  context: VkMarkdownInlineRuleContext,
  marker: string,
  findClose: (text: string, marker: string, start: number) => number,
): number | null => {
  const close = findClose(context.source, marker, context.index + marker.length);
  if (close <= context.index) {
    return null;
  }

  const beforeClose = context.source[close - 1] ?? "";
  return beforeClose && !isWhitespace(beforeClose) ? close : null;
};

const createStyledItems = (
  parsedContent: ReturnType<VkMarkdownInlineRuleContext["parseInline"]>,
  styles: readonly StyledFormatType[],
) => {
  const items = [...parsedContent.items];

  if (parsedContent.text.length === 0) {
    return items;
  }

  for (const style of styles) {
    items.push({ type: style, offset: 0, length: parsedContent.text.length });
  }

  return items;
};

const findClosingLinkDestination = (text: string, start: number): number => {
  let index = start;
  let nestedParens = 0;

  while (index < text.length) {
    const ch = text[index];
    if (ch === "\\") {
      index += 2;
      continue;
    }

    if (ch === "(") {
      nestedParens += 1;
      index += 1;
      continue;
    }

    if (ch === ")") {
      if (nestedParens === 0) {
        return index;
      }
      nestedParens -= 1;
      index += 1;
      continue;
    }

    index += 1;
  }

  return -1;
};

const createLiteralResult = (
  text: string,
  consumedTo: number,
): VkMarkdownInlineRuleResult => ({
  consumedTo,
  rendered: { text, items: [] },
});

const findMatchingMarker = (
  source: string,
  index: number,
  markers: readonly string[],
): string | null => {
  for (const marker of markers) {
    if (source.startsWith(marker, index)) {
      return marker;
    }
  }

  return null;
};

const parseStyledMarker = (
  context: VkMarkdownInlineRuleContext,
  marker: string,
  styles: readonly StyledFormatType[],
  findClose: (text: string, marker: string, start: number) => number = findClosing,
): VkMarkdownInlineRuleResult | null => {
  if (shouldRenderLiteralMarker(context, marker)) {
    return createLiteralResult(marker, context.index + marker.length);
  }

  const close = findValidMarkerClose(context, marker, findClose);
  if (close === null) {
    return null;
  }

  const parsedContent = context.parseInline(
    context.source.slice(context.index + marker.length, close),
  );
  const items = createStyledItems(parsedContent, styles);

  return {
    consumedTo: close + marker.length,
    rendered: {
      text: parsedContent.text,
      items,
    },
  };
};

export const markdownToVkInlineEscapeRule: VkMarkdownInlineRule = (context) => {
  if (context.source[context.index] !== "\\") {
    return null;
  }

  if (context.index + 1 >= context.source.length) {
    return null;
  }

  return createLiteralResult(context.source[context.index + 1], context.index + 2);
};

export const markdownToVkInlineCodeSpanRule: VkMarkdownInlineRule = (context) => {
  if (context.source[context.index] !== "`") {
    return null;
  }

  const close = findClosing(context.source, "`", context.index + 1);
  if (close <= context.index) {
    return null;
  }

  return {
    consumedTo: close + 1,
    rendered: { text: context.source.slice(context.index, close + 1), items: [] },
  };
};

export const markdownToVkInlineLinkRule: VkMarkdownInlineRule = (context) => {
  if (context.source[context.index] !== "[") {
    return null;
  }

  const closeBracket = findClosing(context.source, "]", context.index + 1);
  if (closeBracket <= context.index || context.source[closeBracket + 1] !== "(") {
    return null;
  }

  const closeParen = findClosingLinkDestination(context.source, closeBracket + 2);
  if (closeParen <= closeBracket + 1) {
    return null;
  }

  const label = context.source.slice(context.index + 1, closeBracket);
  const url = context.source.slice(closeBracket + 2, closeParen);
  const parsedLabel = context.parseInline(label);
  const items = [...parsedLabel.items];

  if (parsedLabel.text.length > 0) {
    items.push({
      type: "url",
      offset: 0,
      length: parsedLabel.text.length,
      url,
    });
  }

  return {
    consumedTo: closeParen + 1,
    rendered: {
      text: parsedLabel.text,
      items,
    },
  };
};

export const markdownToVkInlineStrongEmphasisRule: VkMarkdownInlineRule = (context) => {
  const marker = findMatchingMarker(context.source, context.index, ["***", "___"]);
  if (!marker) {
    return null;
  }

  return parseStyledMarker(context, marker, ["bold", "italic"]);
};

export const markdownToVkInlineEmphasisRule: VkMarkdownInlineRule = (context) => {
  const marker = context.source[context.index];
  if ((marker !== "*" && marker !== "_") || context.source.startsWith(marker + marker, context.index)) {
    return null;
  }

  const nextChar = context.source[context.index + 1] ?? "";
  const prevChar = context.source[context.index - 1] ?? "";
  if (!nextChar || isWhitespace(nextChar) || (isAlphaNum(prevChar) && isAlphaNum(nextChar))) {
    return createLiteralResult(marker, context.index + 1);
  }

  return parseStyledMarker(context, marker, ["italic"], findClosingSingleEmphasis);
};

export const markdownToVkInlineStrongRule: VkMarkdownInlineRule = (context) => {
  const marker = findMatchingMarker(context.source, context.index, ["**", "__"]);
  if (!marker) {
    return null;
  }

  return parseStyledMarker(context, marker, ["bold"]);
};

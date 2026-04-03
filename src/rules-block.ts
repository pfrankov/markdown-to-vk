import { shiftFormatItems } from "./format-utils.js";
import { createBlockResult } from "./rules-block-utils.js";
import type { VkFormatItem, VkFormatType, VkMarkdownBlockRule } from "./types.js";

export { markdownToVkBlockTableRule } from "./rules-block-table.js";

const VK_SOLID_SEPARATOR = "─".repeat(3);

const parseAtxHeading = (line: string): { level: number; content: string } | null => {
  const match = line.match(/^(?: {0,3})(#{1,6})(.*)$/);
  if (!match) {
    return null;
  }

  const marker = match[1] ?? "";
  const rest = match[2] ?? "";
  if (rest.length > 0 && !/^[\t ]/.test(rest)) {
    return null;
  }

  const withoutPrefixSpace = rest.replace(/^[\t ]+/, "");
  const withoutClosingHashes = withoutPrefixSpace.replace(/[\t ]+#+[\t ]*$/, "");

  return {
    level: marker.length,
    content: withoutClosingHashes.replace(/[\t ]+$/, ""),
  };
};

const parseTaskCheckboxLine = (line: string): string | null => {
  const match = line.match(/^([ \t]{0,3})[-+*][ \t]+\[([ xX])\](.*)$/);
  if (!match) {
    return null;
  }

  const indent = match[1] ?? "";
  const state = match[2] ?? " ";
  const rest = match[3] ?? "";

  return `${indent}${state === " " ? "□" : "■"}${rest}`;
};

const parseBlockQuoteLine = (line: string): { prefix: string; content: string } | null => {
  let index = 0;
  while (index < line.length && index < 3 && line[index] === " ") {
    index += 1;
  }

  if (line[index] !== ">") {
    return null;
  }

  while (index < line.length && line[index] === ">") {
    index += 1;
    if (line[index] === " " || line[index] === "\t") {
      index += 1;
    }
  }

  return {
    prefix: line.slice(0, index),
    content: line.slice(index),
  };
};

const isMarkdownHyphenSeparator = (line: string): boolean => /^(?: {0,3})(?:-\s*){3,}$/.test(line);

const toStableUpperCase = (text: string): string =>
  [...text]
    .map((char) => {
      const upper = char.toLocaleUpperCase("ru-RU");
      return [...upper].length === 1 ? upper : char;
    })
    .join("");

const createQuoteItems = (
  quoteText: string,
  prefixLength: number,
  inlineItems: VkFormatItem[],
): VkFormatItem[] => {
  const items = shiftFormatItems(inlineItems, prefixLength);

  if (!quoteText) {
    return items;
  }

  return [...items, { type: "italic", offset: 0, length: quoteText.length }];
};

export const markdownToVkBlockSeparatorRule: VkMarkdownBlockRule = (context) => {
  if (!isMarkdownHyphenSeparator(context.line)) {
    return null;
  }

  return createBlockResult(context.chunk.length, context.lineBreak, VK_SOLID_SEPARATOR);
};

export const markdownToVkBlockQuoteRule: VkMarkdownBlockRule = (context) => {
  const quoteLine = parseBlockQuoteLine(context.line);
  if (!quoteLine) {
    return null;
  }

  const normalizedQuoteContent = parseTaskCheckboxLine(quoteLine.content) ?? quoteLine.content;
  const parsedQuoteContent = context.parseInline(normalizedQuoteContent);
  const quoteText = `${quoteLine.prefix}${parsedQuoteContent.text}`;
  const items = createQuoteItems(quoteText, quoteLine.prefix.length, parsedQuoteContent.items);

  return createBlockResult(context.chunk.length, context.lineBreak, quoteText, items);
};

export const markdownToVkBlockCheckboxRule: VkMarkdownBlockRule = (context) => {
  const checkboxLine = parseTaskCheckboxLine(context.line);
  if (checkboxLine === null) {
    return null;
  }

  const parsedCheckbox = context.parseInline(checkboxLine);

  return createBlockResult(
    context.chunk.length,
    context.lineBreak,
    parsedCheckbox.text,
    parsedCheckbox.items,
  );
};

export const markdownToVkBlockHeadingRule: VkMarkdownBlockRule = (context) => {
  const heading = parseAtxHeading(context.line);
  if (!heading) {
    return null;
  }

  const parsedHeading = context.parseInline(heading.content);
  const headingStyle: VkFormatType = heading.level >= 4 ? "italic" : "bold";
  const headingText = heading.level === 1 ? toStableUpperCase(parsedHeading.text) : parsedHeading.text;
  const items = parsedHeading.items.filter((item) => item.type !== headingStyle);

  if (headingText.length > 0) {
    items.push({ type: headingStyle, offset: 0, length: headingText.length });
  }

  return createBlockResult(context.chunk.length, context.lineBreak, headingText, items);
};

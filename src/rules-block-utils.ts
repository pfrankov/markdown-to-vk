import type { VkFormatItem, VkMarkdownBlockRuleResult } from "./types.js";

export const getLineConsumedTo = (chunkLength: number, lineBreak: number): number =>
  lineBreak === -1 ? chunkLength : lineBreak + 1;

export const appendTrailingNewline = (text: string, lineBreak: number): string =>
  lineBreak === -1 ? text : `${text}\n`;

export const createBlockResult = (
  chunkLength: number,
  lineBreak: number,
  text: string,
  items: VkFormatItem[] = [],
): VkMarkdownBlockRuleResult => ({
  consumedTo: getLineConsumedTo(chunkLength, lineBreak),
  rendered: {
    text: appendTrailingNewline(text, lineBreak),
    items,
  },
});

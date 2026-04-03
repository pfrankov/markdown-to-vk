import type { VkInlineParseResult, VkMarkdownBlockRuleContext, VkMarkdownInlineRuleContext } from "../../src/types";

export const parseInlineIdentity = (source: string): VkInlineParseResult => ({ text: source, items: [] });

export const makeInlineContext = ({
  source,
  index = 0,
  parseInline = parseInlineIdentity,
}: {
  source: string;
  index?: number;
  parseInline?: (source: string) => VkInlineParseResult;
}): VkMarkdownInlineRuleContext => ({
  source,
  index,
  parseInline,
});

export const makeBlockContext = ({
  chunk,
  line,
  lineStart = 0,
  lineBreak,
  nextLine,
  parseInline = parseInlineIdentity,
}: {
  chunk: string;
  line: string;
  lineStart?: number;
  lineBreak?: number;
  nextLine: string | null;
  parseInline?: (source: string) => VkInlineParseResult;
}): VkMarkdownBlockRuleContext => {
  const resolvedLineBreak = lineBreak ?? chunk.indexOf("\n", lineStart);
  const lineEnd = resolvedLineBreak === -1 ? chunk.length : resolvedLineBreak;

  return {
    chunk,
    line,
    lineStart,
    lineEnd,
    lineBreak: resolvedLineBreak,
    nextLine,
    parseInline,
  };
};

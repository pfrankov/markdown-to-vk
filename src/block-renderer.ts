import { mergeFormatItems } from "./format-utils.js";
import { appendRendered, createRenderedBuffer, type VkRenderedBuffer } from "./render-output.js";
import type {
  VkInlineParseResult,
  VkInlineParser,
  VkMarkdownBlockRule,
  VkMarkdownBlockRuleContext,
  VkMarkdownBlockRuleResult,
  VkMarkdownSource,
} from "./types.js";

type StaticBlockContext = Omit<VkMarkdownBlockRuleContext, "parseInline">;

const createLineContext = (chunk: string, lineStart: number): StaticBlockContext => {
  const lineBreak = chunk.indexOf("\n", lineStart);
  const lineEnd = lineBreak === -1 ? chunk.length : lineBreak;
  const nextLineStart = lineBreak === -1 ? -1 : lineBreak + 1;
  const nextLineBreak = nextLineStart === -1 ? -1 : chunk.indexOf("\n", nextLineStart);
  const nextLineEnd = nextLineBreak === -1 ? chunk.length : nextLineBreak;

  return {
    chunk,
    line: chunk.slice(lineStart, lineEnd),
    lineStart,
    lineEnd,
    lineBreak,
    nextLine: nextLineStart === -1 ? null : chunk.slice(nextLineStart, nextLineEnd),
  };
};

const findMatchingBlockRule = (
  blockRules: VkMarkdownBlockRule[],
  context: StaticBlockContext,
  parseInline: VkInlineParser,
): VkMarkdownBlockRuleResult | null => {
  for (const rule of blockRules) {
    const matched = rule({ ...context, parseInline });
    if (matched !== null) {
      return matched;
    }
  }

  return null;
};

const appendPlainRange = (
  buffer: VkRenderedBuffer,
  parseInline: VkInlineParser,
  chunk: string,
  from: number,
  to: number,
): void => {
  if (from >= to) {
    return;
  }

  appendRendered(buffer, parseInline(chunk.slice(from, to)));
};

const resolveNextLineStart = (
  chunkLength: number,
  lineStart: number,
  lineBreak: number,
  matched: VkMarkdownBlockRuleResult,
): number => {
  const fallbackNext = lineBreak === -1 ? chunkLength : lineBreak + 1;

  if (matched.consumedTo > lineStart) {
    return matched.consumedTo;
  }

  if (fallbackNext > lineStart) {
    return fallbackNext;
  }

  return lineStart + 1;
};

const renderChunk = (
  chunk: string,
  parseInline: VkInlineParser,
  blockRules: VkMarkdownBlockRule[],
  buffer: VkRenderedBuffer,
): void => {
  let lineStart = 0;
  let plainStart = 0;

  while (lineStart <= chunk.length) {
    const lineContext = createLineContext(chunk, lineStart);
    const matched = findMatchingBlockRule(blockRules, lineContext, parseInline);

    if (matched !== null) {
      appendPlainRange(buffer, parseInline, chunk, plainStart, lineStart);
      appendRendered(buffer, matched.rendered);

      lineStart = resolveNextLineStart(chunk.length, lineContext.lineStart, lineContext.lineBreak, matched);
      plainStart = lineStart;

      if (lineStart > chunk.length) {
        break;
      }

      continue;
    }

    if (lineContext.lineBreak === -1) {
      break;
    }

    lineStart = lineContext.lineBreak + 1;
  }

  appendPlainRange(buffer, parseInline, chunk, plainStart, chunk.length);
};

const renderChunksOutsideCodeFences = (
  source: string,
  parseInline: VkInlineParser,
  blockRules: VkMarkdownBlockRule[],
  buffer: VkRenderedBuffer,
): void => {
  let index = 0;
  let inCodeFence = false;

  while (index < source.length) {
    if (source.startsWith("```", index)) {
      buffer.text += "```";
      inCodeFence = !inCodeFence;
      index += 3;
      continue;
    }

    if (inCodeFence) {
      buffer.text += source[index];
      index += 1;
      continue;
    }

    const nextFence = source.indexOf("```", index);
    const chunkEnd = nextFence === -1 ? source.length : nextFence;

    renderChunk(source.slice(index, chunkEnd), parseInline, blockRules, buffer);
    index = chunkEnd;
  }
};

export const createMarkdownToVkRenderer = (
  parseInline: VkInlineParser,
  blockRules: VkMarkdownBlockRule[],
): ((markdown: VkMarkdownSource) => VkInlineParseResult) => {
  return (markdown: VkMarkdownSource): VkInlineParseResult => {
    const buffer = createRenderedBuffer();
    const source = markdown ?? "";

    renderChunksOutsideCodeFences(source, parseInline, blockRules, buffer);

    return {
      text: buffer.text,
      items: mergeFormatItems(buffer.items),
    };
  };
};

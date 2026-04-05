import type { VkFormatItem, VkInlineParseResult, VkMarkdownChunk, VkMarkdownPipelineOutput } from "./types.js";

type RenderedBlockType = "blank" | "paragraph" | "quote" | "list" | "table" | "fence";

type RenderedBlock = {
  type: RenderedBlockType;
  start: number;
  end: number;
};

type LineRange = {
  start: number;
  end: number;
  content: string;
};

type MeasuredOffsets = number[];

const MIN_SOFT_BREAK_RATIO = 0.6;
const QUOTE_LINE_RE = /^ {0,3}>/;
const CHECKBOX_LINE_RE = /^[ \t]{0,3}[□■](?:[\p{White_Space}]|$)/u;
const LIST_LINE_RE = /^[ \t]{0,3}(?:[-+*]|\d+[.)])(?:[\p{White_Space}]|$)/u;
const SENTENCE_END_CHARS = new Set([".", "!", "?", "…"]);
const WHITESPACE_RE = /\p{White_Space}/u;

const isWhitespace = (char: string | undefined): boolean => typeof char === "string" && WHITESPACE_RE.test(char);

const isBlankLine = (line: string): boolean => line.trim() === "";

const isFenceLine = (line: string): boolean => line.trimStart().startsWith("```");

const isQuoteLine = (line: string): boolean => QUOTE_LINE_RE.test(line);

const isListLine = (line: string): boolean => CHECKBOX_LINE_RE.test(line) || LIST_LINE_RE.test(line);

const isTableLine = (line: string): boolean => line.includes(" | ");

const isTableStart = (lines: LineRange[], index: number): boolean =>
  index + 1 < lines.length && isTableLine(lines[index]?.content ?? "") && isTableLine(lines[index + 1]?.content ?? "");

const getCharacterCost = (char: string): number => (char === "@" ? 2 : 1);

const buildMeasuredOffsets = (text: string): MeasuredOffsets => {
  const offsets: MeasuredOffsets = [0];

  for (let index = 0; index < text.length; index += 1) {
    offsets.push(offsets[index] + getCharacterCost(text[index] as string));
  }

  return offsets;
};

const getMeasuredLength = (offsets: MeasuredOffsets, start: number, end: number): number =>
  (offsets[end] ?? 0) - (offsets[start] ?? 0);

const collectLineRanges = (text: string): LineRange[] => {
  const lines: LineRange[] = [];
  let start = 0;

  while (start < text.length) {
    const lineBreak = text.indexOf("\n", start);
    if (lineBreak === -1) {
      lines.push({ start, end: text.length, content: text.slice(start) });
      break;
    }

    lines.push({ start, end: lineBreak + 1, content: text.slice(start, lineBreak) });
    start = lineBreak + 1;
  }

  return lines;
};

const consumeWhile = (
  lines: LineRange[],
  startIndex: number,
  predicate: (line: LineRange, index: number) => boolean,
): number => {
  let index = startIndex;
  while (index < lines.length && predicate(lines[index] as LineRange, index)) {
    index += 1;
  }

  return index;
};

const consumeFenceBlock = (lines: LineRange[], startIndex: number): number => {
  let index = startIndex + 1;

  while (index < lines.length) {
    if (isFenceLine(lines[index]?.content ?? "")) {
      return index + 1;
    }

    index += 1;
  }

  return lines.length;
};

const consumeParagraphBlock = (lines: LineRange[], startIndex: number): number =>
  consumeWhile(
    lines,
    startIndex + 1,
    (line, index) =>
      !isBlankLine(line.content) &&
      !isFenceLine(line.content) &&
      !isQuoteLine(line.content) &&
      !isListLine(line.content) &&
      !isTableStart(lines, index),
  );

const consumeTrailingBlankLines = (lines: LineRange[], startIndex: number): number =>
  consumeWhile(lines, startIndex, (line) => isBlankLine(line.content));

const createBlock = (
  type: RenderedBlockType,
  lines: LineRange[],
  startIndex: number,
  endIndex: number,
): RenderedBlock => ({
  type,
  start: lines[startIndex]?.start ?? 0,
  end: lines[Math.max(endIndex - 1, startIndex)]?.end ?? 0,
});

const resolveBlockShape = (
  lines: LineRange[],
  startIndex: number,
): { type: RenderedBlockType; endIndex: number } => {
  const currentLine = lines[startIndex]?.content ?? "";

  if (isFenceLine(currentLine)) {
    return { type: "fence", endIndex: consumeFenceBlock(lines, startIndex) };
  }

  if (isTableStart(lines, startIndex)) {
    return {
      type: "table",
      endIndex: consumeWhile(lines, startIndex + 2, (line) => isTableLine(line.content)),
    };
  }

  if (isQuoteLine(currentLine)) {
    return {
      type: "quote",
      endIndex: consumeWhile(lines, startIndex + 1, (line) => isQuoteLine(line.content)),
    };
  }

  if (isListLine(currentLine)) {
    return {
      type: "list",
      endIndex: consumeWhile(lines, startIndex + 1, (line) => isListLine(line.content)),
    };
  }

  return { type: "paragraph", endIndex: consumeParagraphBlock(lines, startIndex) };
};

const collectRenderedBlocks = (text: string): RenderedBlock[] => {
  const lines = collectLineRanges(text);
  const blocks: RenderedBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    if (isBlankLine(lines[index]?.content ?? "")) {
      const endIndex = consumeTrailingBlankLines(lines, index);
      blocks.push(createBlock("blank", lines, index, endIndex));
      index = endIndex;
      continue;
    }

    const { type, endIndex } = resolveBlockShape(lines, index);
    const blockEndIndex = consumeTrailingBlankLines(lines, endIndex);
    blocks.push(createBlock(type, lines, index, blockEndIndex));
    index = blockEndIndex;
  }

  return blocks;
};

const isSentenceBoundary = (text: string, position: number): boolean => {
  if (position <= 0) {
    return false;
  }

  if (isWhitespace(text[position - 1])) {
    let cursor = position - 2;
    while (cursor >= 0 && isWhitespace(text[cursor])) {
      cursor -= 1;
    }

    return cursor >= 0 && SENTENCE_END_CHARS.has(text[cursor] as string);
  }

  return false;
};

const findLastBoundary = (
  text: string,
  start: number,
  end: number,
  predicate: (position: number) => boolean,
): number | null => {
  for (let position = end; position > start; position -= 1) {
    if (predicate(position)) {
      return position;
    }
  }

  return null;
};

const resolveSafeHardBreak = (text: string, start: number, end: number): number => {
  if (end <= start) {
    return start;
  }

  if (end < text.length) {
    const previous = text.charCodeAt(end - 1);
    const next = text.charCodeAt(end);
    const splitsSurrogatePair =
      previous >= 0xd800 &&
      previous <= 0xdbff &&
      next >= 0xdc00 &&
      next <= 0xdfff;

    if (splitsSurrogatePair && end - 1 > start) {
      return end - 1;
    }
  }

  return end;
};

const resolveMinimumProgressBreak = (text: string, start: number, maxEnd: number): number => {
  if (start >= maxEnd) {
    return maxEnd;
  }

  const next = Math.min(start + 1, maxEnd);
  return resolveSafeHardBreak(text, start, next);
};

const findMaxMeasuredEnd = (
  offsets: MeasuredOffsets,
  text: string,
  start: number,
  maxLength: number,
  maxEnd: number,
): number => {
  let low = start + 1;
  let high = maxEnd;
  let best = start;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (getMeasuredLength(offsets, start, middle) <= maxLength) {
      best = middle;
      low = middle + 1;
      continue;
    }

    high = middle - 1;
  }

  return best > start ? best : resolveMinimumProgressBreak(text, start, maxEnd);
};

const findPreferredBoundary = (
  text: string,
  start: number,
  end: number,
  preferLineBreaks: boolean,
): number => {
  const preferredStart = start + Math.max(1, Math.floor((end - start) * MIN_SOFT_BREAK_RATIO));
  const searchStarts = [preferredStart, start];
  const strategies = preferLineBreaks
    ? [
        (position: number) => text[position - 1] === "\n",
        (position: number) => isSentenceBoundary(text, position),
        (position: number) => isWhitespace(text[position - 1]),
      ]
    : [
        (position: number) => isSentenceBoundary(text, position),
        (position: number) => text[position - 1] === "\n",
        (position: number) => isWhitespace(text[position - 1]),
      ];

  for (const searchStart of searchStarts) {
    for (const strategy of strategies) {
      const boundary = findLastBoundary(text, searchStart, end, strategy);
      if (boundary !== null) {
        return boundary;
      }
    }
  }

  return resolveSafeHardBreak(text, start, end);
};

const splitOversizedBlock = (
  offsets: MeasuredOffsets,
  text: string,
  block: RenderedBlock,
  start: number,
  chunkSize: number,
): number => {
  const end = findMaxMeasuredEnd(offsets, text, start, chunkSize, block.end);
  const preferLineBreaks = block.type !== "paragraph" && block.type !== "blank";
  const boundary = findPreferredBoundary(text, start, end, preferLineBreaks);

  return boundary > start ? boundary : end;
};

const clipItemToChunk = (
  item: VkFormatItem,
  chunkStart: number,
  chunkEnd: number,
): VkFormatItem | null => {
  const itemStart = item.offset;
  const itemEnd = item.offset + item.length;
  const clippedStart = Math.max(itemStart, chunkStart);
  const clippedEnd = Math.min(itemEnd, chunkEnd);
  const clippedLength = clippedEnd - clippedStart;

  if (clippedLength <= 0) {
    return null;
  }

  return {
    ...item,
    offset: clippedStart - chunkStart,
    length: clippedLength,
  };
};

const buildChunk = (
  rendered: VkInlineParseResult,
  chunkStart: number,
  chunkEnd: number,
): VkMarkdownChunk => ({
  text: rendered.text.slice(chunkStart, chunkEnd),
  items: rendered.items
    .map((item) => clipItemToChunk(item, chunkStart, chunkEnd))
    .filter((item): item is VkFormatItem => item !== null),
});

const findContainingBlockIndex = (
  blocks: RenderedBlock[],
  chunkStart: number,
  blockIndex: number,
): number => {
  let nextIndex = blockIndex;

  while ((blocks[nextIndex]?.end ?? 0) <= chunkStart) {
    nextIndex += 1;
  }

  return nextIndex;
};

const consumeWholeBlocks = (
  blocks: RenderedBlock[],
  offsets: MeasuredOffsets,
  chunkStart: number,
  chunkSize: number,
  startIndex: number,
): number => {
  let chunkEnd = chunkStart;
  let scanIndex = startIndex;

  while (scanIndex < blocks.length) {
    const blockEnd = blocks[scanIndex]?.end ?? chunkStart;
    if (getMeasuredLength(offsets, chunkStart, blockEnd) > chunkSize) {
      break;
    }

    chunkEnd = Math.max(chunkEnd, blockEnd);
    scanIndex += 1;
  }

  return chunkEnd;
};

const resolveChunkEnd = (
  rendered: VkInlineParseResult,
  blocks: RenderedBlock[],
  offsets: MeasuredOffsets,
  chunkStart: number,
  chunkSize: number,
  blockIndex: number,
): number => {
  const chunkEnd = consumeWholeBlocks(blocks, offsets, chunkStart, chunkSize, blockIndex);
  if (chunkEnd > chunkStart) {
    return chunkEnd;
  }

  const currentBlock = blocks[blockIndex] ?? {
    type: "paragraph" as const,
    start: chunkStart,
    end: rendered.text.length,
  };

  return splitOversizedBlock(offsets, rendered.text, currentBlock, chunkStart, chunkSize);
};

export const splitRenderedIntoChunks = (
  rendered: VkInlineParseResult,
  chunkSize: number,
): VkMarkdownPipelineOutput => {
  if (rendered.text.length === 0) {
    return [];
  }

  const blocks = collectRenderedBlocks(rendered.text);
  const measuredOffsets = buildMeasuredOffsets(rendered.text);
  const chunks: VkMarkdownChunk[] = [];
  let blockIndex = 0;

  for (let chunkStart = 0; chunkStart < rendered.text.length; ) {
    blockIndex = findContainingBlockIndex(blocks, chunkStart, blockIndex);
    const chunkEnd = resolveChunkEnd(rendered, blocks, measuredOffsets, chunkStart, chunkSize, blockIndex);
    chunks.push(buildChunk(rendered, chunkStart, chunkEnd));
    chunkStart = chunkEnd;
  }

  return chunks;
};

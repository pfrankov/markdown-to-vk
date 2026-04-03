import { createMarkdownToVkRenderer } from "./block-renderer.js";
import { createMarkdownToVkInlineParser } from "./inline-parser.js";
import {
  markdownToVkInlineCodeSpanRule,
  markdownToVkInlineEmphasisRule,
  markdownToVkInlineEscapeRule,
  markdownToVkInlineLinkRule,
  markdownToVkInlineStrongEmphasisRule,
  markdownToVkInlineStrongRule,
} from "./rules-inline.js";
import {
  markdownToVkBlockCheckboxRule,
  markdownToVkBlockHeadingRule,
  markdownToVkBlockQuoteRule,
  markdownToVkBlockSeparatorRule,
  markdownToVkBlockTableRule,
} from "./rules-block.js";
import type {
  VkInlineParseResult,
  VkMarkdownChunk,
  VkFormatItem,
  VkMarkdownBlockRule,
  VkMarkdownBlockTransform,
  VkMarkdownInlineRule,
  VkMarkdownInlineTransform,
  VkMarkdownPipeline,
  VkMarkdownPipelineOptions,
  VkMarkdownPipelineOutput,
  VkMarkdownSource,
  VkMarkdownTextTransform,
  VkMarkdownTransform,
} from "./types.js";

const asInlineTransform = (rule: VkMarkdownInlineRule): VkMarkdownInlineTransform =>
  Object.assign(rule, { mode: "inline" as const });

const asBlockTransform = (rule: VkMarkdownBlockRule): VkMarkdownBlockTransform =>
  Object.assign(rule, { mode: "block" as const });

const isInlineTransform = (transform: VkMarkdownTransform): transform is VkMarkdownInlineTransform =>
  transform.mode === "inline";

const isBlockTransform = (transform: VkMarkdownTransform): transform is VkMarkdownBlockTransform =>
  transform.mode === "block";

const VK_DEFAULT_MESSAGE_CHUNK_SIZE = 4096;

export const escapeTransform = asInlineTransform(markdownToVkInlineEscapeRule);
export const codeSpanTransform = asInlineTransform(markdownToVkInlineCodeSpanRule);
export const linkTransform = asInlineTransform(markdownToVkInlineLinkRule);
export const strongEmphasisTransform = asInlineTransform(markdownToVkInlineStrongEmphasisRule);
export const emphasisTransform = asInlineTransform(markdownToVkInlineEmphasisRule);
export const strongTransform = asInlineTransform(markdownToVkInlineStrongRule);

export const tableTransform = asBlockTransform(markdownToVkBlockTableRule);
export const separatorTransform = asBlockTransform(markdownToVkBlockSeparatorRule);
export const quoteTransform = asBlockTransform(markdownToVkBlockQuoteRule);
export const checkboxTransform = asBlockTransform(markdownToVkBlockCheckboxRule);
export const headingTransform = asBlockTransform(markdownToVkBlockHeadingRule);

const defaultPipeline: VkMarkdownTransform[] = [
  escapeTransform,
  codeSpanTransform,
  linkTransform,
  strongEmphasisTransform,
  emphasisTransform,
  strongTransform,
  tableTransform,
  separatorTransform,
  quoteTransform,
  checkboxTransform,
  headingTransform,
];

export const collapseBlankLinesBeforeCodeFencesTransform: VkMarkdownTextTransform = (text) => {
  if (!text) {
    return "";
  }

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const normalized: string[] = [];
  let inFence = false;

  for (const line of lines) {
    const isFence = line.trimStart().startsWith("```");
    if (isFence && !inFence) {
      while (normalized.length > 0 && normalized[normalized.length - 1].trim() === "") {
        normalized.pop();
      }
    }

    normalized.push(line);

    if (isFence) {
      inFence = !inFence;
    }
  }

  return normalized.join("\n");
};

const defaultTextTransforms: VkMarkdownTextTransform[] = [collapseBlankLinesBeforeCodeFencesTransform];

const applyTextTransforms = (source: string, transforms: VkMarkdownTextTransform[]): string =>
  transforms.reduce((current, transform) => transform(current), source);

const resolveChunkSize = (chunkSize: number | undefined): number => {
  if (typeof chunkSize !== "number" || !Number.isFinite(chunkSize)) {
    return VK_DEFAULT_MESSAGE_CHUNK_SIZE;
  }

  const normalized = Math.floor(chunkSize);
  return normalized > 0 ? normalized : 1;
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

const splitRenderedIntoChunks = (
  rendered: VkInlineParseResult,
  chunkSize: number,
): VkMarkdownPipelineOutput => {
  if (rendered.text.length === 0) {
    return [];
  }

  const chunks: VkMarkdownChunk[] = [];

  for (let chunkStart = 0; chunkStart < rendered.text.length; chunkStart += chunkSize) {
    const chunkEnd = Math.min(chunkStart + chunkSize, rendered.text.length);
    const text = rendered.text.slice(chunkStart, chunkEnd);
    const items = rendered.items
      .map((item) => clipItemToChunk(item, chunkStart, chunkEnd))
      .filter((item): item is VkFormatItem => item !== null);

    chunks.push({ text, items });
  }

  return chunks;
};

export function createMarkdownToVkPipeline(options: VkMarkdownPipelineOptions = {}): VkMarkdownPipeline {
  const pipeline = options.pipeline ? [...options.pipeline] : [...defaultPipeline];
  const textTransforms = options.textTransforms ? [...options.textTransforms] : [...defaultTextTransforms];
  const chunkSize = resolveChunkSize(options.chunkSize);
  const inlinePipeline = pipeline.filter(isInlineTransform);
  const blockPipeline = pipeline.filter(isBlockTransform);
  const parseInline = createMarkdownToVkInlineParser(inlinePipeline);
  const renderMarkdown = createMarkdownToVkRenderer(parseInline, blockPipeline);
  const render = (markdown: VkMarkdownSource) => {
    const source = applyTextTransforms(markdown ?? "", textTransforms);
    return splitRenderedIntoChunks(renderMarkdown(source), chunkSize);
  };

  return {
    pipeline,
    textTransforms,
    chunkSize,
    render,
  };
}

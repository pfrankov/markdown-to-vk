import { createMarkdownTableBlockRule } from "./table-layout.js";
import { estimateRenderedTextWidth } from "./text-width.js";
import type { VkInlineParseResult, VkMarkdownBlockRule } from "./types.js";

const HEADER_WIDTH_OPTIONS = { extraStyles: ["bold"] as const };

const estimateCellWidth = (cell: VkInlineParseResult, isHeader: boolean): number =>
  estimateRenderedTextWidth(cell, isHeader ? HEADER_WIDTH_OPTIONS : undefined);

export const markdownToVkBlockTableRule: VkMarkdownBlockRule =
  createMarkdownTableBlockRule(estimateCellWidth);

import { shiftFormatItems } from "./format-utils.js";
import type { VkFormatItem, VkInlineParseResult } from "./types.js";

export type VkRenderedBuffer = {
  text: string;
  items: VkFormatItem[];
};

export const createRenderedBuffer = (): VkRenderedBuffer => ({
  text: "",
  items: [],
});

export const appendRendered = (
  buffer: VkRenderedBuffer,
  rendered: VkInlineParseResult,
): void => {
  const offset = buffer.text.length;
  buffer.text += rendered.text;

  if (rendered.items.length > 0) {
    buffer.items.push(...shiftFormatItems(rendered.items, offset));
  }
};

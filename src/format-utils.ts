import type { VkFormatItem } from "./types.js";

export const shiftFormatItems = (items: VkFormatItem[], offsetDelta: number): VkFormatItem[] =>
  items.map((item) => ({
    ...item,
    offset: item.offset + offsetDelta,
  }));

export const mergeFormatItems = (items: VkFormatItem[]): VkFormatItem[] => {
  if (items.length === 0) {
    return items;
  }

  const sorted = items
    .filter((item) => item.length > 0)
    .slice()
    .sort((a, b) => (a.offset === b.offset ? a.type.localeCompare(b.type) : a.offset - b.offset));

  const merged: VkFormatItem[] = [];
  for (const item of sorted) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.type === item.type &&
      (last.url ?? "") === (item.url ?? "") &&
      last.offset + last.length === item.offset
    ) {
      last.length += item.length;
      continue;
    }

    merged.push({ ...item });
  }

  return merged;
};

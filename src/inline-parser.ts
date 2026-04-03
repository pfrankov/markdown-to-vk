import { appendRendered, createRenderedBuffer } from "./render-output.js";
import type {
  VkInlineParser,
  VkMarkdownInlineRule,
  VkMarkdownInlineRuleResult,
} from "./types.js";

const findMatchingInlineRule = (
  inlineRules: VkMarkdownInlineRule[],
  source: string,
  index: number,
  parseInline: VkInlineParser,
): VkMarkdownInlineRuleResult | null => {
  for (const rule of inlineRules) {
    const matched = rule({ source, index, parseInline });
    if (matched !== null) {
      return matched;
    }
  }

  return null;
};

const getSafeConsumedTo = (match: VkMarkdownInlineRuleResult, index: number): number =>
  match.consumedTo > index ? match.consumedTo : index + 1;

export const createMarkdownToVkInlineParser = (inlineRules: VkMarkdownInlineRule[]): VkInlineParser => {
  const parseInline: VkInlineParser = (source) => {
    const rendered = createRenderedBuffer();
    let index = 0;

    while (index < source.length) {
      const matched = findMatchingInlineRule(inlineRules, source, index, parseInline);

      if (matched === null) {
        rendered.text += source[index];
        index += 1;
        continue;
      }

      appendRendered(rendered, matched.rendered);
      index = getSafeConsumedTo(matched, index);
    }

    return rendered;
  };

  return parseInline;
};

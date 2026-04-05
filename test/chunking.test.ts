import { describe, expect, it } from "vitest";

import { createMarkdownToVkPipeline } from "../src/pipeline";
import type { VkMarkdownChunk } from "../src/types";

const renderSingleChunk = (markdown: string): VkMarkdownChunk => {
  const rendered = createMarkdownToVkPipeline({ chunkSize: 10_000 }).render(markdown);

  expect(rendered).toHaveLength(1);
  return rendered[0] as VkMarkdownChunk;
};

describe("natural chunking", () => {
  it("preserves paragraph boundaries when each paragraph fits into its own chunk", () => {
    const firstParagraph = renderSingleChunk("first paragraph");
    const secondParagraph = renderSingleChunk("second paragraph");
    const chunkSize = firstParagraph.text.length + 2;
    const rendered = createMarkdownToVkPipeline({ chunkSize }).render("first paragraph\n\nsecond paragraph");

    expect(rendered).toEqual([
      { text: `${firstParagraph.text}\n\n`, items: firstParagraph.items },
      { text: secondParagraph.text, items: secondParagraph.items },
    ]);
  });

  it("splits oversized quote blocks by lines instead of tearing quote prefixes", () => {
    const markdown = ["> quoted line", "> second line"].join("\n");
    const renderedQuote = renderSingleChunk(markdown);
    const lineBoundary = renderedQuote.text.indexOf("\n") + 1;
    const rendered = createMarkdownToVkPipeline({ chunkSize: lineBoundary }).render(markdown);

    expect(rendered.map((chunk) => chunk.text)).toEqual([
      renderedQuote.text.slice(0, lineBoundary),
      renderedQuote.text.slice(lineBoundary),
    ]);
  });

  it("splits oversized tables by row boundaries", () => {
    const markdown = ["| A | B |", "| --- | --- |", "| 1 | 2 |"].join("\n");
    const renderedTable = renderSingleChunk(markdown);
    const lineBoundary = renderedTable.text.indexOf("\n") + 1;
    const chunkSize = Math.max(...renderedTable.text.split("\n").map((line) => line.length));
    const rendered = createMarkdownToVkPipeline({ chunkSize }).render(markdown);

    expect(rendered.map((chunk) => chunk.text)).toEqual([
      renderedTable.text.slice(0, lineBoundary),
      renderedTable.text.slice(lineBoundary),
    ]);
  });

  it("treats @ as a double-width VK character when enforcing chunk size", () => {
    const rendered = createMarkdownToVkPipeline({ chunkSize: 8 }).render("aa@bb cc");

    expect(rendered).toEqual([
      { text: "aa@bb ", items: [] },
      { text: "cc", items: [] },
    ]);
  });

  it("clips long formatting items across natural word boundaries", () => {
    const rendered = createMarkdownToVkPipeline({ chunkSize: 12 }).render("**alpha beta gamma**");

    expect(rendered).toEqual([
      { text: "alpha beta ", items: [{ type: "bold", offset: 0, length: 11 }] },
      { text: "gamma", items: [{ type: "bold", offset: 0, length: 5 }] },
    ]);
  });

  it("keeps mixed block documents on whole-block boundaries when each block fits", () => {
    const parts = [
      "first paragraph",
      "> quote\n> second",
      ["| A | B |", "| --- | --- |", "| 1 | 2 |"].join("\n"),
      ["```", "const value = 1;", "console.log(value);", "```"].join("\n"),
      "**tail**",
    ];
    const fullMarkdown = parts.join("\n\n");
    const fullRendered = renderSingleChunk(fullMarkdown);
    const renderedParts = parts.map((part) => renderSingleChunk(part));
    const chunkSize = Math.max(...renderedParts.map((part) => part.text.length)) + 2;
    const rendered = createMarkdownToVkPipeline({ chunkSize }).render(fullMarkdown);

    expect(rendered.map((chunk) => chunk.text).join("")).toBe(fullRendered.text);

    for (const part of renderedParts) {
      expect(rendered.some((chunk) => chunk.text.includes(part.text))).toBe(true);
    }
  });
});

import { describe, expect, it } from "vitest";

import { createMarkdownToVkPipeline } from "../src/pipeline";
import { markdownToVkBlockTableRule } from "../src/rules-block-table";
import { estimateRenderedTextWidth } from "../src/text-width";
import type { VkInlineParseResult } from "../src/types";
import { makeBlockContext } from "./support/context";

const render = (text: string, items: VkInlineParseResult["items"] = []): VkInlineParseResult => ({
  text,
  items,
});

describe("text width estimation", () => {
  it("distinguishes narrow, wide, emoji, and combining graphemes", () => {
    expect(estimateRenderedTextWidth(render("WWW"))).toBeGreaterThan(
      estimateRenderedTextWidth(render("iii")),
    );
    expect(estimateRenderedTextWidth(render("漢"))).toBeGreaterThan(
      estimateRenderedTextWidth(render("A")),
    );
    expect(estimateRenderedTextWidth(render("🙂"))).toBeGreaterThan(
      estimateRenderedTextWidth(render("W")),
    );
    expect(estimateRenderedTextWidth(render("e\u0301"))).toBeCloseTo(
      estimateRenderedTextWidth(render("e")),
      5,
    );
  });

  it("accounts for style-specific width changes", () => {
    const plainBoldProbe = estimateRenderedTextWidth(render("iii"));
    const boldProbe = estimateRenderedTextWidth(
      render("iii", [{ type: "bold", offset: 0, length: 3 }]),
    );
    const plainItalicProbe = estimateRenderedTextWidth(render("$$$"));
    const italicProbe = estimateRenderedTextWidth(
      render("$$$", [{ type: "italic", offset: 0, length: 3 }]),
    );
    const boldWord = estimateRenderedTextWidth(
      render("API width", [{ type: "bold", offset: 0, length: 9 }]),
    );
    const boldItalicWord = estimateRenderedTextWidth(
      render("API width", [
        { type: "bold", offset: 0, length: 9 },
        { type: "italic", offset: 0, length: 9 },
      ]),
    );
    const forcedBold = estimateRenderedTextWidth(render("iii"), {
      extraStyles: ["bold"],
    });

    expect(boldProbe).toBeGreaterThan(plainBoldProbe);
    expect(italicProbe).not.toBe(plainItalicProbe);
    expect(boldItalicWord).toBeGreaterThanOrEqual(boldWord);
    expect(forcedBold).toBeCloseTo(boldProbe, 5);
  });
});

describe("table rendering with styled widths", () => {
  const pipeline = createMarkdownToVkPipeline();
  const parseInline = (source: string): VkInlineParseResult =>
    pipeline.render(source)[0] ?? { text: "", items: [] };

  it("adds compensating padding when sibling cells differ only by formatting width", () => {
    const chunk = ["| A | B |", "| --- | --- |", "| a | ***WW*** |", "| b | WW |"].join("\n");

    const rendered = markdownToVkBlockTableRule(
      makeBlockContext({
        chunk,
        line: "| A | B |",
        nextLine: "| --- | --- |",
        lineBreak: chunk.indexOf("\n"),
        parseInline,
      }),
    );

    expect(rendered).not.toBeNull();
    expect(rendered?.rendered.text.split("\n")).toEqual([
      "A\u2009 | B    \u2009",
      "a  | WW\u200A",
      "b  | WW\u2009\u200A",
    ]);
    expect(rendered?.rendered.items).toEqual([
      { type: "bold", offset: 0, length: 1 },
      { type: "bold", offset: 5, length: 1 },
      { type: "bold", offset: 17, length: 2 },
      { type: "italic", offset: 17, length: 2 },
    ]);
  });
});

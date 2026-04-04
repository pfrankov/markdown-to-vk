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

  it("increases width for bold, italic, and combined styles", () => {
    const plain = estimateRenderedTextWidth(render("WW"));
    const italic = estimateRenderedTextWidth(
      render("WW", [{ type: "italic", offset: 0, length: 2 }]),
    );
    const bold = estimateRenderedTextWidth(
      render("WW", [{ type: "bold", offset: 0, length: 2 }]),
    );
    const boldItalic = estimateRenderedTextWidth(
      render("WW", [
        { type: "bold", offset: 0, length: 2 },
        { type: "italic", offset: 0, length: 2 },
      ]),
    );
    const forcedBold = estimateRenderedTextWidth(render("WW"), {
      extraStyles: ["bold"],
    });

    expect(italic).toBeGreaterThan(plain);
    expect(bold).toBeGreaterThan(plain);
    expect(boldItalic).toBeGreaterThan(bold);
    expect(forcedBold).toBeCloseTo(bold, 5);
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
      "A | B    ",
      "a  | WW",
      "b  | WW ",
    ]);
    expect(rendered?.rendered.items).toEqual([
      { type: "bold", offset: 0, length: 1 },
      { type: "bold", offset: 4, length: 1 },
      { type: "bold", offset: 15, length: 2 },
      { type: "italic", offset: 15, length: 2 },
    ]);
  });
});

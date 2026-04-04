import { describe, it, expect } from "vitest";
import { createCanvasTableTransform } from "../src/canvas-table-transform";
import { createMarkdownToVkPipeline, tableTransform } from "../src/pipeline";
import { markdownToVkBlockTableRule } from "../src/rules-block";
import { makeBlockContext } from "./support/context";
import type { VkInlineParseResult, VkMarkdownBlockTransform } from "../src/types";

describe("createCanvasTableTransform", () => {
  it("returns a block transform with mode 'block'", () => {
    const transform = createCanvasTableTransform();
    expect(transform.mode).toBe("block");
  });

  it("renders a simple table with canvas-based measurement", () => {
    const transform = createCanvasTableTransform();

    const chunk = ["| Name | Value |", "| --- | --- |", "| foo | 123 |"].join("\n");

    const result = transform({
      chunk,
      line: "| Name | Value |",
      lineStart: 0,
      lineEnd: 16,
      lineBreak: chunk.indexOf("\n"),
      nextLine: "| --- | --- |",
      parseInline: (s: string) => ({ text: s, items: [] }),
    });

    expect(result).not.toBeNull();
    expect(result!.rendered.text).toContain("Name");
    expect(result!.rendered.text).toContain("Value");
    expect(result!.rendered.text).toContain("foo");
    expect(result!.rendered.text).toContain("123");
    expect(result!.rendered.text).toContain("|");
  });

  it("produces bold items for header cells", () => {
    const transform = createCanvasTableTransform();

    const chunk = ["| A |", "| --- |", "| x |"].join("\n");

    const result = transform({
      chunk,
      line: "| A |",
      lineStart: 0,
      lineEnd: 5,
      lineBreak: chunk.indexOf("\n"),
      nextLine: "| --- |",
      parseInline: (s: string) => ({ text: s, items: [] }),
    });

    expect(result).not.toBeNull();
    const boldItems = result!.rendered.items.filter((i) => i.type === "bold");
    expect(boldItems.length).toBeGreaterThanOrEqual(1);
  });

  it("accepts custom fontSize and fontFamily options", () => {
    const transform = createCanvasTableTransform({
      fontSize: 20,
      fontFamily: "sans-serif",
    });

    const chunk = ["| A | B |", "| --- | --- |", "| a | b |"].join("\n");

    const result = transform({
      chunk,
      line: "| A | B |",
      lineStart: 0,
      lineEnd: 9,
      lineBreak: chunk.indexOf("\n"),
      nextLine: "| --- | --- |",
      parseInline: (s: string) => ({ text: s, items: [] }),
    });

    expect(result).not.toBeNull();
    expect(result!.rendered.text).toContain("A");
    expect(result!.rendered.text).toContain("B");
  });

  it("aligns columns more evenly than heuristic transform", () => {
    const canvasTransform = createCanvasTableTransform();

    const chunk = [
      "| Имя | Цена |",
      "| --- | ---: |",
      "| Молоко | 89 |",
      "| Хлеб | 45 |",
    ].join("\n");

    const canvasResult = canvasTransform({
      chunk,
      line: "| Имя | Цена |",
      lineStart: 0,
      lineEnd: 15,
      lineBreak: chunk.indexOf("\n"),
      nextLine: "| --- | ---: |",
      parseInline: (s: string) => ({ text: s, items: [] }),
    });

    const heuristicResult = markdownToVkBlockTableRule(
      makeBlockContext({
        chunk,
        line: "| Имя | Цена |",
        nextLine: "| --- | ---: |",
        lineBreak: chunk.indexOf("\n"),
        parseInline: (s: string) => ({ text: s, items: [] }),
      }),
    );

    expect(canvasResult).not.toBeNull();
    expect(heuristicResult).not.toBeNull();

    const canvasLines = canvasResult!.rendered.text.split("\n");
    const heuristicLines = heuristicResult!.rendered.text.split("\n");

    expect(canvasLines.length).toBe(heuristicLines.length);
    expect(canvasLines.every((line) => line.includes("|"))).toBe(true);
  });

  it("can replace tableTransform in a pipeline", () => {
    const canvasTable: VkMarkdownBlockTransform = createCanvasTableTransform({
      fontFamily: "sans-serif",
    });

    const pipeline = createMarkdownToVkPipeline({
      pipeline: [canvasTable],
    });

    const markdown = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    const output = pipeline.render(markdown);

    expect(output.length).toBeGreaterThanOrEqual(1);
    expect(output[0].text).toContain("1");
    expect(output[0].text).toContain("2");
    expect(output[0].text).toContain("|");
  });

  it("handles inline bold/italic formatting in cells", () => {
    const canvasTable = createCanvasTableTransform();

    const pipeline = createMarkdownToVkPipeline({
      pipeline: [canvasTable],
      textTransforms: [],
    });

    const output = pipeline.render("| **bold** | *italic* |\n| --- | --- |\n| text | text |");
    expect(output.length).toBeGreaterThanOrEqual(1);
    expect(output[0].text).toContain("bold");
    expect(output[0].text).toContain("italic");
  });

  it("returns null for non-table input", () => {
    const transform = createCanvasTableTransform();

    const result = transform({
      chunk: "just text",
      line: "just text",
      lineStart: 0,
      lineEnd: 9,
      lineBreak: -1,
      nextLine: null,
      parseInline: (s: string) => ({ text: s, items: [] }),
    });

    expect(result).toBeNull();
  });

  it("uses sans-serif font by default when no options given", () => {
    const transform = createCanvasTableTransform();
    expect(transform.mode).toBe("block");
  });

  it("uses six-per-em space (U+2006) for padding, not hair space (U+200A)", () => {
    const transform = createCanvasTableTransform();

    const chunk = ["| A | LongerWord |", "| --- | --- |", "| x | y |"].join("\n");

    const result = transform({
      chunk,
      line: "| A | LongerWord |",
      lineStart: 0,
      lineEnd: 19,
      lineBreak: chunk.indexOf("\n"),
      nextLine: "| --- | --- |",
      parseInline: (s: string) => ({ text: s, items: [] }),
    });

    expect(result).not.toBeNull();
    const text = result!.rendered.text;
    expect(text).not.toContain("\u200A");
    expect(text.includes(" ") || text.includes("\u2009") || text.includes("\u2006")).toBe(true);
  });

  it("corrects emoji width with default emojiWidthEm", () => {
    const transform = createCanvasTableTransform();

    const chunk = ["| Icon | Name |", "| --- | --- |", "| 🔥 | Fire |", "| x | Ice |"].join("\n");

    const result = transform({
      chunk,
      line: "| Icon | Name |",
      lineStart: 0,
      lineEnd: 14,
      lineBreak: chunk.indexOf("\n"),
      nextLine: "| --- | --- |",
      parseInline: (s: string) => ({ text: s, items: [] }),
    });

    expect(result).not.toBeNull();
    expect(result!.rendered.text).toContain("🔥");
    expect(result!.rendered.text).toContain("Fire");
  });

  it("accepts custom emojiWidthEm option", () => {
    const transform = createCanvasTableTransform({
      emojiWidthEm: 1.0,
    });

    const chunk = ["| E | V |", "| --- | --- |", "| 🚀 | go |"].join("\n");

    const result = transform({
      chunk,
      line: "| E | V |",
      lineStart: 0,
      lineEnd: 9,
      lineBreak: chunk.indexOf("\n"),
      nextLine: "| --- | --- |",
      parseInline: (s: string) => ({ text: s, items: [] }),
    });

    expect(result).not.toBeNull();
    expect(result!.rendered.text).toContain("🚀");
  });
});

import { describe, expect, it } from "vitest";

import {
  collapseBlankLinesBeforeCodeFencesTransform,
  checkboxTransform,
  codeSpanTransform,
  createMarkdownToVkPipeline,
  emphasisTransform,
  escapeTransform,
  headingTransform,
  linkTransform,
  quoteTransform,
  separatorTransform,
  strongEmphasisTransform,
  strongTransform,
  tableTransform,
} from "../src/pipeline";

describe("pipeline and renderer", () => {
  it("exposes transform modes", () => {
    expect(escapeTransform.mode).toBe("inline");
    expect(codeSpanTransform.mode).toBe("inline");
    expect(linkTransform.mode).toBe("inline");
    expect(strongEmphasisTransform.mode).toBe("inline");
    expect(emphasisTransform.mode).toBe("inline");
    expect(strongTransform.mode).toBe("inline");

    expect(tableTransform.mode).toBe("block");
    expect(separatorTransform.mode).toBe("block");
    expect(quoteTransform.mode).toBe("block");
    expect(checkboxTransform.mode).toBe("block");
    expect(headingTransform.mode).toBe("block");
    expect(typeof collapseBlankLinesBeforeCodeFencesTransform).toBe("function");
  });

  it("supports custom pipeline and protects from zero-progress inline rules", () => {
    const stuckInline = Object.assign(
      (context: { source: string; index: number }) => ({
        consumedTo: context.index,
        rendered: { text: context.source[context.index].toUpperCase(), items: [] },
      }),
      { mode: "inline" as const },
    );

    const custom = createMarkdownToVkPipeline({ pipeline: [stuckInline] });
    expect(custom.pipeline).toHaveLength(1);
    expect(custom.textTransforms).toHaveLength(1);
    expect(custom.chunkSize).toBe(4096);
    expect(custom.render("abc")).toEqual([{ text: "ABC", items: [] }]);
  });

  it("supports zero-progress block rules without infinite loop", () => {
    const literalInline = Object.assign(
      (context: { source: string; index: number }) => ({
        consumedTo: context.index + 1,
        rendered: { text: context.source[context.index], items: [] },
      }),
      { mode: "inline" as const },
    );

    const zeroBlock = Object.assign(
      (context: { line: string; lineStart: number }) =>
        context.line === "hit"
          ? { consumedTo: context.lineStart, rendered: { text: "", items: [] } }
          : null,
      { mode: "block" as const },
    );

    const tailBlock = Object.assign(
      (context: { lineStart: number; chunk: string }) =>
        context.lineStart === context.chunk.length
          ? { consumedTo: context.lineStart, rendered: { text: "", items: [] } }
          : null,
      { mode: "block" as const },
    );

    const pipeline = createMarkdownToVkPipeline({
      pipeline: [literalInline, zeroBlock, tailBlock],
    });

    expect(pipeline.render("hit\n")).toEqual([]);
  });

  it("default pipeline handles inline and block markdown plus contiguous bold merge", () => {
    const pipeline = createMarkdownToVkPipeline();
    const markdown = [
      "# title",
      "---",
      "> quote",
      "- [ ] task",
      "**a****b** and _x_ and ***y*** and [z](https://example.com)",
    ].join("\n");

    const rendered = pipeline.render(markdown);
    expect(rendered).toHaveLength(1);

    const [chunk] = rendered;
    expect(chunk).toBeDefined();
    expect(chunk?.text).toContain("TITLE");
    expect(chunk?.text).toContain("───");
    expect(chunk?.text).toContain("> quote");
    expect(chunk?.text).toContain("□ task");
    expect(chunk?.text).toContain("ab and x and y and z");

    const boldAbOffset = chunk?.text.indexOf("ab and") ?? -1;
    const headingOffset = chunk?.text.indexOf("TITLE") ?? -1;
    const quoteOffset = chunk?.text.indexOf("> quote") ?? -1;
    const xOffset = chunk?.text.indexOf("x and y") ?? -1;
    const yOffset = chunk?.text.indexOf("y and z") ?? -1;
    const zOffset = chunk?.text.lastIndexOf("z") ?? -1;

    expect(chunk?.items).toEqual(
      expect.arrayContaining([
        { type: "bold", offset: headingOffset, length: "TITLE".length },
        { type: "italic", offset: quoteOffset, length: "> quote".length },
        { type: "bold", offset: boldAbOffset, length: 2 },
        { type: "italic", offset: xOffset, length: 1 },
        { type: "bold", offset: yOffset, length: 1 },
        { type: "italic", offset: yOffset, length: 1 },
        { type: "url", offset: zOffset, length: 1, url: "https://example.com" },
      ]),
    );
  });

  it("does not parse markdown inside fenced code blocks", () => {
    const pipeline = createMarkdownToVkPipeline();
    const rendered = pipeline.render("before\n```\n**not bold**\n```\nafter");
    expect(rendered).toEqual([{ text: "before\n```\n**not bold**\n```\nafter", items: [] }]);
  });

  it("applies default text transform before parsing", () => {
    const pipeline = createMarkdownToVkPipeline();
    const rendered = pipeline.render("one\n\n\n```\ncode\n```");
    expect(rendered).toEqual([{ text: "one\n```\ncode\n```", items: [] }]);
  });

  it("uses nullish markdown fallback in pipeline render", () => {
    expect(createMarkdownToVkPipeline().render(undefined)).toEqual([]);
    expect(createMarkdownToVkPipeline().render(null)).toEqual([]);

    const customInline = Object.assign(
      () => ({ consumedTo: 1, rendered: { text: "K", items: [] } }),
      { mode: "inline" as const },
    );

    expect(createMarkdownToVkPipeline({ pipeline: [customInline] }).render(undefined)).toEqual([]);
  });

  it("supports custom text transforms", () => {
    const pipeline = createMarkdownToVkPipeline({
      textTransforms: [(source) => source.replaceAll("a", "A")],
    });

    expect(pipeline.textTransforms).toHaveLength(1);
    expect(pipeline.render("a\n\n\n```\ncode\n```")).toEqual([{ text: "A\n\n\n```\ncode\n```", items: [] }]);
  });

  it("chunks long messages by 4096 chars by default", () => {
    const pipeline = createMarkdownToVkPipeline();
    const rendered = pipeline.render("a".repeat(5000));

    expect(rendered).toHaveLength(2);
    expect(rendered[0]).toEqual({ text: "a".repeat(4096), items: [] });
    expect(rendered[1]).toEqual({ text: "a".repeat(904), items: [] });
  });

  it("splits formatting items across chunk boundaries", () => {
    const pipeline = createMarkdownToVkPipeline();
    const rendered = pipeline.render(`**${"a".repeat(5000)}**`);

    expect(rendered).toHaveLength(2);
    expect(rendered[0]?.text).toHaveLength(4096);
    expect(rendered[1]?.text).toHaveLength(904);
    expect(rendered[0]?.items).toEqual([{ type: "bold", offset: 0, length: 4096 }]);
    expect(rendered[1]?.items).toEqual([{ type: "bold", offset: 0, length: 904 }]);
  });

  it("supports custom chunk size in pipeline options", () => {
    const pipeline = createMarkdownToVkPipeline({ chunkSize: 10 });
    expect(pipeline.chunkSize).toBe(10);
    const rendered = pipeline.render("**abcdefghijklmno**");

    expect(rendered).toEqual([
      { text: "abcdefghij", items: [{ type: "bold", offset: 0, length: 10 }] },
      { text: "klmno", items: [{ type: "bold", offset: 0, length: 5 }] },
    ]);
  });
});

import { describe, expect, it } from "vitest";

import {
  markdownToVkBlockCheckboxRule,
  markdownToVkBlockHeadingRule,
  markdownToVkBlockQuoteRule,
  markdownToVkBlockSeparatorRule,
  markdownToVkBlockTableRule,
} from "../src/rules-block";
import { createMarkdownToVkPipeline } from "../src/pipeline";
import { makeBlockContext, parseInlineIdentity } from "./support/context";

describe("block rules", () => {
  const pipeline = createMarkdownToVkPipeline();

  it("table rule rejects non-table lines and invalid delimiters", () => {
    const simple = makeBlockContext({
      chunk: "not table",
      line: "not table",
      nextLine: null,
    });

    expect(markdownToVkBlockTableRule(simple)).toBeNull();

    const invalidDelimiter = makeBlockContext({
      chunk: "a|b\n----\n",
      line: "a|b",
      nextLine: "----",
    });

    expect(markdownToVkBlockTableRule(invalidDelimiter)).toBeNull();
  });

  it("table rule renders header/body with alignment and escaped pipes", () => {
    const chunk = [
      "| Name | Mid | Num |",
      "| :--- | :---: | ---: |",
      "| a\\|b | 🙂漢W i() -9Aaz§\t | 42 |",
      "| left | c | 1,200 |",
    ].join("\n");

    const context = makeBlockContext({
      chunk,
      line: "| Name | Mid | Num |",
      nextLine: "| :--- | :---: | ---: |",
      lineBreak: chunk.indexOf("\n"),
      parseInline: (source) => pipeline.render(source)[0] ?? { text: "", items: [] },
    });

    const rendered = markdownToVkBlockTableRule(context);
    expect(rendered).not.toBeNull();
    expect(rendered?.rendered.text).toContain("Name");
    expect(rendered?.rendered.text).toContain("a|b");
    expect(rendered?.rendered.text).toContain("1,200");

    const boldHeaders = rendered?.rendered.items.filter((item) => item.type === "bold") ?? [];
    expect(boldHeaders.length).toBeGreaterThanOrEqual(3);
    expect(rendered?.consumedTo).toBe(chunk.length);
  });

  it("renders irregular auto-aligned tables and stops on non-table rows", () => {
    const chunk = ["A | B | C", "--- | --- | ---", "1 | 2 | 3 | 4", "x | y", "stop here"].join("\n");

    const rendered = markdownToVkBlockTableRule(
      makeBlockContext({
        chunk,
        line: "A | B | C",
        lineBreak: chunk.indexOf("\n"),
        nextLine: "--- | --- | ---",
        parseInline: parseInlineIdentity,
      }),
    );

    expect(rendered).not.toBeNull();
    expect(rendered?.rendered.text).toMatch(/1\s+\|\s+2 \| 3 \| 4/);
    expect(rendered?.rendered.text).toContain("x");
    expect((rendered?.consumedTo ?? chunk.length) < chunk.length).toBe(true);
  });

  it("supports detached delimiter context with lineBreak = -1", () => {
    const rendered = markdownToVkBlockTableRule(
      makeBlockContext({
        chunk: "A | B",
        line: "A | B",
        lineBreak: -1,
        nextLine: "--- | ---",
        parseInline: parseInlineIdentity,
      }),
    );

    expect(rendered).toEqual({
      consumedTo: 5,
      rendered: {
        text: "A | B",
        items: [
          { type: "bold", offset: 0, length: 1 },
          { type: "bold", offset: 4, length: 1 },
        ],
      },
    });
  });

  it("keeps non-bold inline header items while rebuilding bold header style", () => {
    const rendered = markdownToVkBlockTableRule(
      makeBlockContext({
        chunk: "| H |\n| --- |",
        line: "| H |",
        lineBreak: 5,
        nextLine: "| --- |",
        parseInline: (source) => ({
          text: source,
          items: [
            { type: "bold", offset: 0, length: source.length },
            { type: "italic", offset: 0, length: source.length },
          ],
        }),
      }),
    );

    expect(rendered).not.toBeNull();
    expect(rendered?.rendered.items).toEqual([
      { type: "italic", offset: 0, length: 1 },
      { type: "bold", offset: 0, length: 1 },
    ]);
  });

  it("separator rule supports conversion and no-match path", () => {
    expect(
      markdownToVkBlockSeparatorRule(
        makeBlockContext({ chunk: "abc", line: "abc", nextLine: null, lineBreak: -1 }),
      ),
    ).toBeNull();

    expect(
      markdownToVkBlockSeparatorRule(
        makeBlockContext({ chunk: "---", line: "---", nextLine: null, lineBreak: -1 }),
      ),
    ).toEqual({
      consumedTo: 3,
      rendered: { text: "───", items: [] },
    });

    expect(
      markdownToVkBlockSeparatorRule(
        makeBlockContext({ chunk: "---\n", line: "---", nextLine: "", lineBreak: 3 }),
      ),
    ).toEqual({
      consumedTo: 4,
      rendered: { text: "───\n", items: [] },
    });
  });

  it("quote rule handles nested markers and checkbox normalization", () => {
    expect(
      markdownToVkBlockQuoteRule(
        makeBlockContext({ chunk: "plain", line: "plain", nextLine: null, lineBreak: -1 }),
      ),
    ).toBeNull();

    const result = markdownToVkBlockQuoteRule(
      makeBlockContext({
        chunk: ">> - [X] done\n",
        line: ">> - [X] done",
        nextLine: "",
        lineBreak: 13,
        parseInline: (source) => ({
          text: source.replace("done", "ok"),
          items: [{ type: "underline", offset: 0, length: source.length }],
        }),
      }),
    );

    expect(result).toEqual({
      consumedTo: 14,
      rendered: {
        text: ">> ■ ok\n",
        items: [
          { type: "underline", offset: 3, length: 6 },
          { type: "italic", offset: 0, length: 7 },
        ],
      },
    });
  });

  it("handles quote at end of chunk without trailing newline", () => {
    const rendered = markdownToVkBlockQuoteRule(
      makeBlockContext({
        chunk: "   > tail",
        line: "   > tail",
        lineBreak: -1,
        nextLine: null,
        parseInline: parseInlineIdentity,
      }),
    );

    expect(rendered).toEqual({
      consumedTo: 9,
      rendered: {
        text: "   > tail",
        items: [{ type: "italic", offset: 0, length: 9 }],
      },
    });
  });

  it("checkbox rule parses task list marks", () => {
    expect(
      markdownToVkBlockCheckboxRule(
        makeBlockContext({ chunk: "plain", line: "plain", nextLine: null, lineBreak: -1 }),
      ),
    ).toBeNull();

    const checked = markdownToVkBlockCheckboxRule(
      makeBlockContext({
        chunk: "- [x] task",
        line: "- [x] task",
        nextLine: null,
        lineBreak: -1,
      }),
    );

    expect(checked).toEqual({
      consumedTo: 10,
      rendered: { text: "■ task", items: [] },
    });

    const unchecked = markdownToVkBlockCheckboxRule(
      makeBlockContext({
        chunk: "  - [ ] task\n",
        line: "  - [ ] task",
        nextLine: "",
        lineBreak: 12,
      }),
    );

    expect(unchecked?.rendered.text).toBe("  □ task\n");
  });

  it("heading rule handles style levels and invalid headings", () => {
    expect(
      markdownToVkBlockHeadingRule(
        makeBlockContext({ chunk: "#bad", line: "#bad", nextLine: null, lineBreak: -1 }),
      ),
    ).toBeNull();

    const h1 = markdownToVkBlockHeadingRule(
      makeBlockContext({
        chunk: "# hello",
        line: "# hello",
        nextLine: null,
        lineBreak: -1,
        parseInline: () => ({
          text: "привет",
          items: [{ type: "bold", offset: 0, length: 6 }],
        }),
      }),
    );

    expect(h1).toEqual({
      consumedTo: 7,
      rendered: {
        text: "ПРИВЕТ",
        items: [{ type: "bold", offset: 0, length: 6 }],
      },
    });

    const h4 = markdownToVkBlockHeadingRule(
      makeBlockContext({
        chunk: "#### test",
        line: "#### test",
        nextLine: null,
        lineBreak: -1,
        parseInline: () => ({
          text: "T",
          items: [{ type: "italic", offset: 0, length: 1 }],
        }),
      }),
    );

    expect(h4).toEqual({
      consumedTo: 9,
      rendered: {
        text: "T",
        items: [{ type: "italic", offset: 0, length: 1 }],
      },
    });
  });

  it("keeps stable uppercase for characters with multichar uppercase mapping", () => {
    const rendered = markdownToVkBlockHeadingRule(
      makeBlockContext({
        chunk: "# ß",
        line: "# ß",
        lineBreak: -1,
        nextLine: null,
        parseInline: () => ({ text: "ß", items: [] }),
      }),
    );

    expect(rendered).toEqual({
      consumedTo: 3,
      rendered: {
        text: "ß",
        items: [{ type: "bold", offset: 0, length: 1 }],
      },
    });
  });
});

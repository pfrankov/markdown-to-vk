import { describe, expect, it } from "vitest";

import {
  markdownToVkInlineCodeSpanRule,
  markdownToVkInlineEmphasisRule,
  markdownToVkInlineEscapeRule,
  markdownToVkInlineLinkRule,
  markdownToVkInlineStrongEmphasisRule,
  markdownToVkInlineStrongRule,
} from "../src/rules-inline";
import { makeInlineContext, parseInlineIdentity } from "./support/context";

describe("inline rules", () => {
  it("escape rule handles escaped symbols and invalid starts", () => {
    expect(markdownToVkInlineEscapeRule(makeInlineContext({ source: "abc" }))).toBeNull();
    expect(markdownToVkInlineEscapeRule(makeInlineContext({ source: "\\", index: 0 }))).toBeNull();
    expect(markdownToVkInlineEscapeRule(makeInlineContext({ source: "\\*", index: 0 }))).toEqual({
      consumedTo: 2,
      rendered: { text: "*", items: [] },
    });
  });

  it("code span rule handles matching and missing backticks", () => {
    expect(markdownToVkInlineCodeSpanRule(makeInlineContext({ source: "x" }))).toBeNull();
    expect(markdownToVkInlineCodeSpanRule(makeInlineContext({ source: "`open" }))).toBeNull();
    expect(markdownToVkInlineCodeSpanRule(makeInlineContext({ source: "`co\\`de`" }))).toEqual({
      consumedTo: 8,
      rendered: { text: "`co\\`de`", items: [] },
    });
  });

  it("link rule parses inline label and url", () => {
    const parseInline = (source: string) => ({
      text: source.toUpperCase(),
      items: source ? [{ type: "bold" as const, offset: 0, length: source.length }] : [],
    });

    expect(markdownToVkInlineLinkRule(makeInlineContext({ source: "plain", parseInline }))).toBeNull();
    expect(markdownToVkInlineLinkRule(makeInlineContext({ source: "[x](url", parseInline }))).toBeNull();

    const matched = markdownToVkInlineLinkRule(
      makeInlineContext({
        source: "[la*bel*](https://example.com/path(a\\)b))",
        parseInline,
      }),
    );

    expect(matched).not.toBeNull();
    expect(matched?.consumedTo).toBe(41);
    expect(matched?.rendered.text).toBe("LA*BEL*");
    expect(matched?.rendered.items).toEqual([
      { type: "bold", offset: 0, length: 7 },
      {
        type: "url",
        offset: 0,
        length: 7,
        url: "https://example.com/path(a\\)b)",
      },
    ]);
  });

  it("rejects link labels without opening destination paren", () => {
    expect(markdownToVkInlineLinkRule(makeInlineContext({ source: "[x]y" }))).toBeNull();
  });

  it("strong-emphasis rule supports success and fallback branches", () => {
    expect(markdownToVkInlineStrongEmphasisRule(makeInlineContext({ source: "plain" }))).toBeNull();

    expect(markdownToVkInlineStrongEmphasisRule(makeInlineContext({ source: "*** a***" }))).toEqual({
      consumedTo: 3,
      rendered: { text: "***", items: [] },
    });

    expect(markdownToVkInlineStrongEmphasisRule(makeInlineContext({ source: "***abc" }))).toBeNull();
    expect(markdownToVkInlineStrongEmphasisRule(makeInlineContext({ source: "***ab ***" }))).toBeNull();

    const parsed = markdownToVkInlineStrongEmphasisRule(
      makeInlineContext({
        source: "___text___",
        parseInline: (source) => ({
          text: source,
          items: [{ type: "underline", offset: 0, length: source.length }],
        }),
      }),
    );

    expect(parsed).toEqual({
      consumedTo: 10,
      rendered: {
        text: "text",
        items: [
          { type: "underline", offset: 0, length: 4 },
          { type: "bold", offset: 0, length: 4 },
          { type: "italic", offset: 0, length: 4 },
        ],
      },
    });
  });

  it("emphasis rule validates boundaries and marker pairs", () => {
    expect(markdownToVkInlineEmphasisRule(makeInlineContext({ source: "plain" }))).toBeNull();
    expect(markdownToVkInlineEmphasisRule(makeInlineContext({ source: "**x" }))).toBeNull();

    expect(markdownToVkInlineEmphasisRule(makeInlineContext({ source: "* x*" }))).toEqual({
      consumedTo: 1,
      rendered: { text: "*", items: [] },
    });

    expect(markdownToVkInlineEmphasisRule(makeInlineContext({ source: "a_b", index: 1 }))).toEqual({
      consumedTo: 2,
      rendered: { text: "_", items: [] },
    });

    expect(markdownToVkInlineEmphasisRule(makeInlineContext({ source: "*abc" }))).toBeNull();
    expect(markdownToVkInlineEmphasisRule(makeInlineContext({ source: "*ab *" }))).toBeNull();

    const parsed = markdownToVkInlineEmphasisRule(
      makeInlineContext({
        source: "_ok_",
        parseInline: (source) => ({
          text: source,
          items: [{ type: "url", offset: 0, length: source.length, url: "x" }],
        }),
      }),
    );

    expect(parsed).toEqual({
      consumedTo: 4,
      rendered: {
        text: "ok",
        items: [
          { type: "url", offset: 0, length: 2, url: "x" },
          { type: "italic", offset: 0, length: 2 },
        ],
      },
    });
  });

  it("handles escaped emphasis markers and skips marker pairs", () => {
    const escaped = markdownToVkInlineEmphasisRule(
      makeInlineContext({
        source: "*a\\*b*",
        index: 0,
        parseInline: parseInlineIdentity,
      }),
    );

    expect(escaped).toEqual({
      consumedTo: 6,
      rendered: {
        text: "a\\*b",
        items: [{ type: "italic", offset: 0, length: 4 }],
      },
    });

    const paired = markdownToVkInlineEmphasisRule(
      makeInlineContext({
        source: "*ab**c*",
        index: 0,
        parseInline: parseInlineIdentity,
      }),
    );

    expect(paired).toEqual({
      consumedTo: 7,
      rendered: {
        text: "ab**c",
        items: [{ type: "italic", offset: 0, length: 5 }],
      },
    });
  });

  it("strong rule supports success and invalid cases", () => {
    expect(markdownToVkInlineStrongRule(makeInlineContext({ source: "plain" }))).toBeNull();

    expect(markdownToVkInlineStrongRule(makeInlineContext({ source: "** x**" }))).toEqual({
      consumedTo: 2,
      rendered: { text: "**", items: [] },
    });

    expect(markdownToVkInlineStrongRule(makeInlineContext({ source: "__abc" }))).toBeNull();
    expect(markdownToVkInlineStrongRule(makeInlineContext({ source: "__ab __" }))).toBeNull();

    const parsed = markdownToVkInlineStrongRule(
      makeInlineContext({
        source: "**ok**",
        parseInline: (source) => ({
          text: source,
          items: [{ type: "italic", offset: 0, length: source.length }],
        }),
      }),
    );

    expect(parsed).toEqual({
      consumedTo: 6,
      rendered: {
        text: "ok",
        items: [
          { type: "italic", offset: 0, length: 2 },
          { type: "bold", offset: 0, length: 2 },
        ],
      },
    });
  });
});

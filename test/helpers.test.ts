import { describe, expect, it } from "vitest";

import { collapseBlankLinesBeforeCodeFencesTransform } from "../src/pipeline";

describe("helpers", () => {
  it("collapses blank lines before fences and preserves other newlines", () => {
    expect(collapseBlankLinesBeforeCodeFencesTransform("")).toBe("");

    const text = ["one", "", "", "```js", "code", "```", "", "", "two"].join("\n");
    expect(collapseBlankLinesBeforeCodeFencesTransform(text)).toBe([
      "one",
      "```js",
      "code",
      "```",
      "",
      "",
      "two",
    ].join("\n"));

    const withCRLF = "a\r\n\r\n```\r\ncode\r\n```";
    expect(collapseBlankLinesBeforeCodeFencesTransform(withCRLF)).toBe("a\n```\ncode\n```");
  });
});

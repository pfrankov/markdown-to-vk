import { describe, expect, it } from "vitest";

import * as indexExports from "../src/index";
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

describe("index exports", () => {
  it("re-exports runtime API", () => {
    expect(indexExports.createMarkdownToVkPipeline).toBe(createMarkdownToVkPipeline);
    expect(indexExports.collapseBlankLinesBeforeCodeFencesTransform).toBe(collapseBlankLinesBeforeCodeFencesTransform);
    expect(indexExports.escapeTransform).toBe(escapeTransform);
    expect(indexExports.codeSpanTransform).toBe(codeSpanTransform);
    expect(indexExports.linkTransform).toBe(linkTransform);
    expect(indexExports.strongEmphasisTransform).toBe(strongEmphasisTransform);
    expect(indexExports.emphasisTransform).toBe(emphasisTransform);
    expect(indexExports.strongTransform).toBe(strongTransform);
    expect(indexExports.tableTransform).toBe(tableTransform);
    expect(indexExports.separatorTransform).toBe(separatorTransform);
    expect(indexExports.quoteTransform).toBe(quoteTransform);
    expect(indexExports.checkboxTransform).toBe(checkboxTransform);
    expect(indexExports.headingTransform).toBe(headingTransform);
    expect("trimVkFormattedMessage" in indexExports).toBe(false);
    expect("collapseBlankLinesBeforeVkCodeFences" in indexExports).toBe(false);
  });
});

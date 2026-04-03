export type VkFormatType = "bold" | "italic" | "underline" | "url";

export type VkFormatItem = {
  type: VkFormatType;
  offset: number;
  length: number;
  url?: string;
};

export type VkFormatData = {
  version: 1;
  items: VkFormatItem[];
};

export type VkFormattedMessage = {
  text: string;
  formatData?: VkFormatData;
};

export type VkRenderedText = {
  text: string;
  items: VkFormatItem[];
};

export type VkMarkdownChunk = VkRenderedText;
export type VkMarkdownPipelineOutput = VkMarkdownChunk[];

export type VkInlineParseResult = VkRenderedText;
export type VkInlineParser = (source: string) => VkInlineParseResult;
export type VkMarkdownSource = string | undefined | null;

export type VkMarkdownInlineRuleResult = {
  consumedTo: number;
  rendered: VkInlineParseResult;
};

export type VkMarkdownInlineRuleContext = {
  source: string;
  index: number;
  parseInline: VkInlineParser;
};

export type VkMarkdownInlineRule = (
  context: VkMarkdownInlineRuleContext,
) => VkMarkdownInlineRuleResult | null;

export type VkMarkdownBlockRuleResult = {
  consumedTo: number;
  rendered: VkInlineParseResult;
};

export type VkMarkdownBlockRuleContext = {
  chunk: string;
  line: string;
  lineStart: number;
  lineEnd: number;
  lineBreak: number;
  nextLine: string | null;
  parseInline: VkInlineParser;
};

export type VkMarkdownBlockRule = (
  context: VkMarkdownBlockRuleContext,
) => VkMarkdownBlockRuleResult | null;

export type VkMarkdownInlineTransform = VkMarkdownInlineRule & {
  mode: "inline";
};

export type VkMarkdownBlockTransform = VkMarkdownBlockRule & {
  mode: "block";
};

export type VkMarkdownTransform = VkMarkdownInlineTransform | VkMarkdownBlockTransform;

export type VkMarkdownTextTransform = (source: string) => string;

export type VkMarkdownPipelineOptions = {
  pipeline?: VkMarkdownTransform[];
  textTransforms?: VkMarkdownTextTransform[];
  chunkSize?: number;
};

export type VkMarkdownPipeline = {
  pipeline: VkMarkdownTransform[];
  textTransforms: VkMarkdownTextTransform[];
  chunkSize: number;
  render: (markdown: VkMarkdownSource) => VkMarkdownPipelineOutput;
};

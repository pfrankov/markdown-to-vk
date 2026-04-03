import { shiftFormatItems } from "./format-utils.js";
import { createBlockResult } from "./rules-block-utils.js";
import type {
  VkFormatItem,
  VkInlineParseResult,
  VkInlineParser,
  VkMarkdownBlockRule,
} from "./types.js";

type TableAlign = "left" | "right" | "center" | "auto";
type RenderableTableAlign = Exclude<TableAlign, "auto">;

type ParsedTable = {
  headerCells: string[];
  bodyRows: string[][];
  delimiterAlignments: TableAlign[];
  lastConsumedBreak: number;
};

const SPACE_WIDTH_UNITS = 4;
const DEFAULT_CHAR_WIDTH = 6;
const EMPTY_CELL: VkInlineParseResult = { text: "", items: [] };

const CHAR_WIDTH_RULES: ReadonlyArray<{ pattern: RegExp; width: number }> = [
  { pattern: /[\p{Extended_Pictographic}]/u, width: 12 },
  { pattern: /[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/u, width: 11 },
  { pattern: /[MWmw@#%&ЖШЩЮЫФЖшщюыф]/u, width: 9 },
  { pattern: /[ilI1\|'"`.,:;!]/, width: 3 },
  { pattern: /[()\[\]{}]/, width: 4 },
  { pattern: /[-_~]/, width: 5 },
  { pattern: /[0-9]/, width: 7 },
  { pattern: /[A-ZА-ЯЁ]/u, width: 7 },
  { pattern: /[a-zа-яё]/u, width: 6 },
];

const splitTableCells = (line: string): string[] | null => {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.includes("|")) {
    return null;
  }

  let body = trimmed;
  if (body.startsWith("|")) {
    body = body.slice(1);
  }
  if (body.endsWith("|")) {
    body = body.slice(0, -1);
  }

  const cells: string[] = [];
  let current = "";

  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];

    if (character === "\\" && body[index + 1] === "|") {
      current += "\\|";
      index += 1;
      continue;
    }

    if (character === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  cells.push(current.trim());
  return cells;
};

const parseTableAlignment = (cell: string): TableAlign | null => {
  const marker = cell.replace(/\s+/g, "");
  if (!/^:?-{3,}:?$/.test(marker)) {
    return null;
  }

  if (marker.startsWith(":") && marker.endsWith(":")) {
    return "center";
  }

  if (marker.endsWith(":")) {
    return "right";
  }

  if (marker.startsWith(":")) {
    return "left";
  }

  return "auto";
};

const parseTableDelimiter = (line: string, columnCount: number): TableAlign[] | null => {
  const cells = splitTableCells(line);
  if (!cells || cells.length !== columnCount) {
    return null;
  }

  const alignments = cells.map(parseTableAlignment);
  return alignments.every((alignment) => alignment !== null) ? (alignments as TableAlign[]) : null;
};

const normalizeTableCells = (cells: string[], columnCount: number): string[] => {
  if (cells.length === columnCount) {
    return cells;
  }

  if (cells.length > columnCount) {
    return [...cells.slice(0, columnCount - 1), cells.slice(columnCount - 1).join(" | ")];
  }

  return [...cells, ...Array.from({ length: columnCount - cells.length }, () => "")];
};

const isNumericCell = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  const compact = trimmed.replace(/\s+/g, "");
  if (!/\d/.test(compact)) {
    return false;
  }

  return /^[+-]?(?:[$€£¥₽])?(?:(?:\d{1,3}(?:[,_]\d{3})+)|\d+|\d*)(?:[.,]\d+)?(?:[%]|[$€£¥₽])?$/.test(
    compact,
  );
};

const estimateCharWidth = (character: string): number => {
  if (character === " ") {
    return SPACE_WIDTH_UNITS;
  }

  if (character === "\t") {
    return SPACE_WIDTH_UNITS * 4;
  }

  const matchedRule = CHAR_WIDTH_RULES.find(({ pattern }) => pattern.test(character));
  return matchedRule?.width ?? DEFAULT_CHAR_WIDTH;
};

const estimateTextWidth = (text: string): number =>
  [...text].reduce((sum, character) => sum + estimateCharWidth(character), 0);

const getCellText = (row: VkInlineParseResult[], columnIndex: number): string =>
  row[columnIndex]?.text ?? "";

const resolveColumnWidths = (
  headerRow: VkInlineParseResult[],
  bodyRows: VkInlineParseResult[][],
): number[] => {
  return headerRow.map((_, columnIndex) =>
    Math.max(
      estimateTextWidth(getCellText(headerRow, columnIndex)),
      ...bodyRows.map((row) => estimateTextWidth(getCellText(row, columnIndex))),
    ),
  );
};

const resolveBodyAlignments = (
  delimiterAlignments: TableAlign[],
  bodyRows: VkInlineParseResult[][],
): RenderableTableAlign[] => {
  return delimiterAlignments.map((alignment, columnIndex) => {
    if (alignment !== "auto") {
      return alignment;
    }

    const values = bodyRows
      .map((row) => getCellText(row, columnIndex).trim())
      .filter(Boolean);

    return values.length > 0 && values.every(isNumericCell) ? "right" : "left";
  });
};

const resolveHeaderAlignments = (columnCount: number): RenderableTableAlign[] => {
  return Array.from({ length: columnCount }, (_, columnIndex) =>
    columnIndex > 0 && columnIndex < columnCount - 1 ? "center" : "left",
  );
};

const padTableCell = (
  text: string,
  width: number,
  alignment: RenderableTableAlign,
): { rendered: string; leftPad: number } => {
  const textWidth = estimateTextWidth(text);
  if (width <= textWidth) {
    return { rendered: text, leftPad: 0 };
  }

  const spaces = Math.max(1, Math.ceil((width - textWidth) / SPACE_WIDTH_UNITS));
  if (alignment === "right") {
    return { rendered: " ".repeat(spaces) + text, leftPad: spaces };
  }

  if (alignment === "center") {
    const leftPad = Math.floor(spaces / 2);
    const rightPad = spaces - leftPad;

    return {
      rendered: " ".repeat(leftPad) + text + " ".repeat(rightPad),
      leftPad,
    };
  }

  return { rendered: text + " ".repeat(spaces), leftPad: 0 };
};

const createHeaderItems = (cell: VkInlineParseResult, offset: number): VkFormatItem[] => {
  const items = shiftFormatItems(
    cell.items.filter((item) => item.type !== "bold"),
    offset,
  );

  if (!cell.text) {
    return items;
  }

  return [...items, { type: "bold", offset, length: cell.text.length }];
};

const renderTableRow = (
  row: VkInlineParseResult[],
  widths: number[],
  alignments: RenderableTableAlign[],
  isHeader: boolean,
): VkInlineParseResult => {
  let text = "";
  const items: VkFormatItem[] = [];

  for (let columnIndex = 0; columnIndex < widths.length; columnIndex += 1) {
    const cell = row[columnIndex] ?? EMPTY_CELL;
    const { rendered, leftPad } = padTableCell(cell.text, widths[columnIndex], alignments[columnIndex]);
    const contentOffset = text.length + leftPad;

    text += rendered;
    items.push(...(isHeader ? createHeaderItems(cell, contentOffset) : shiftFormatItems(cell.items, contentOffset)));

    if (columnIndex < widths.length - 1) {
      text += " | ";
    }
  }

  return { text, items };
};

const joinRenderedRows = (rows: VkInlineParseResult[]): VkInlineParseResult => {
  let text = "";
  const items: VkFormatItem[] = [];

  rows.forEach((row, rowIndex) => {
    const offset = text.length;
    text += row.text;
    items.push(...shiftFormatItems(row.items, offset));

    if (rowIndex < rows.length - 1) {
      text += "\n";
    }
  });

  return { text, items };
};

const renderMarkdownTable = (params: {
  headerCells: string[];
  bodyRows: string[][];
  delimiterAlignments: TableAlign[];
  parseInline: VkInlineParser;
}): VkInlineParseResult => {
  const headerRow = params.headerCells.map((cell) => params.parseInline(cell));
  const bodyRows = params.bodyRows.map((row) => row.map((cell) => params.parseInline(cell)));
  const widths = resolveColumnWidths(headerRow, bodyRows);
  const headerAlignments = resolveHeaderAlignments(widths.length);
  const bodyAlignments = resolveBodyAlignments(params.delimiterAlignments, bodyRows);
  const renderedRows = [
    renderTableRow(headerRow, widths, headerAlignments, true),
    ...bodyRows.map((row) => renderTableRow(row, widths, bodyAlignments, false)),
  ];

  return joinRenderedRows(renderedRows);
};

const getDelimiterBreak = (chunk: string, lineBreak: number): number =>
  lineBreak === -1 ? -1 : chunk.indexOf("\n", lineBreak + 1);

const collectBodyRows = (
  chunk: string,
  columnCount: number,
  delimiterBreak: number,
): { bodyRows: string[][]; lastConsumedBreak: number } => {
  const bodyRows: string[][] = [];
  let cursor = delimiterBreak === -1 ? chunk.length : delimiterBreak + 1;
  let lastConsumedBreak = delimiterBreak;

  while (cursor <= chunk.length) {
    const rowBreak = chunk.indexOf("\n", cursor);
    const rowEnd = rowBreak === -1 ? chunk.length : rowBreak;
    const rowCells = splitTableCells(chunk.slice(cursor, rowEnd));

    if (rowCells === null) {
      break;
    }

    bodyRows.push(normalizeTableCells(rowCells, columnCount));
    lastConsumedBreak = rowBreak;

    if (rowBreak === -1) {
      return { bodyRows, lastConsumedBreak };
    }

    cursor = rowBreak + 1;
  }

  return { bodyRows, lastConsumedBreak };
};

const parseTable = (context: Parameters<VkMarkdownBlockRule>[0]): ParsedTable | null => {
  const headerCells = splitTableCells(context.line);
  if (!headerCells || context.nextLine === null) {
    return null;
  }

  const delimiterAlignments = parseTableDelimiter(context.nextLine, headerCells.length);
  if (!delimiterAlignments) {
    return null;
  }

  const delimiterBreak = getDelimiterBreak(context.chunk, context.lineBreak);
  const { bodyRows, lastConsumedBreak } = collectBodyRows(
    context.chunk,
    headerCells.length,
    delimiterBreak,
  );

  return {
    headerCells,
    bodyRows,
    delimiterAlignments,
    lastConsumedBreak,
  };
};

export const markdownToVkBlockTableRule: VkMarkdownBlockRule = (context) => {
  const table = parseTable(context);
  if (!table) {
    return null;
  }

  const rendered = renderMarkdownTable({
    headerCells: table.headerCells,
    bodyRows: table.bodyRows,
    delimiterAlignments: table.delimiterAlignments,
    parseInline: context.parseInline,
  });

  return createBlockResult(
    context.chunk.length,
    table.lastConsumedBreak,
    rendered.text,
    rendered.items,
  );
};

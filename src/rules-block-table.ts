import { shiftFormatItems } from "./format-utils.js";
import { createBlockResult } from "./rules-block-utils.js";
import { estimateRenderedTextWidth, TABLE_SPACE_WIDTH_UNITS } from "./text-width.js";
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

const EMPTY_CELL: VkInlineParseResult = { text: "", items: [] };
const HEADER_WIDTH_OPTIONS = { extraStyles: ["bold"] as const };

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

const getCellText = (row: VkInlineParseResult[], columnIndex: number): string =>
  row[columnIndex]?.text ?? "";

const getCell = (row: VkInlineParseResult[], columnIndex: number): VkInlineParseResult =>
  row[columnIndex] ?? EMPTY_CELL;

const estimateCellWidth = (cell: VkInlineParseResult, isHeader: boolean): number =>
  estimateRenderedTextWidth(cell, isHeader ? HEADER_WIDTH_OPTIONS : undefined);

const resolveColumnWidths = (
  headerRow: VkInlineParseResult[],
  bodyRows: VkInlineParseResult[][],
): number[] => {
  return headerRow.map((_, columnIndex) =>
    Math.max(
      estimateCellWidth(getCell(headerRow, columnIndex), true),
      ...bodyRows.map((row) => estimateCellWidth(getCell(row, columnIndex), false)),
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
  cell: VkInlineParseResult,
  width: number,
  alignment: RenderableTableAlign,
  isHeader: boolean,
): { rendered: string; leftPad: number } => {
  const textWidth = estimateCellWidth(cell, isHeader);
  if (width <= textWidth) {
    return { rendered: cell.text, leftPad: 0 };
  }

  const spaces = Math.max(1, Math.ceil((width - textWidth) / TABLE_SPACE_WIDTH_UNITS));
  if (alignment === "right") {
    return { rendered: " ".repeat(spaces) + cell.text, leftPad: spaces };
  }

  if (alignment === "center") {
    const leftPad = Math.floor(spaces / 2);
    const rightPad = spaces - leftPad;

    return {
      rendered: " ".repeat(leftPad) + cell.text + " ".repeat(rightPad),
      leftPad,
    };
  }

  return { rendered: cell.text + " ".repeat(spaces), leftPad: 0 };
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
    const cell = getCell(row, columnIndex);
    const { rendered, leftPad } = padTableCell(
      cell,
      widths[columnIndex],
      alignments[columnIndex],
      isHeader,
    );
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

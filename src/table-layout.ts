import { shiftFormatItems } from "./format-utils.js";
import { createBlockResult } from "./rules-block-utils.js";
import type {
  VkFormatItem,
  VkInlineParseResult,
  VkInlineParser,
  VkMarkdownBlockRule,
  VkMarkdownBlockRuleContext,
} from "./types.js";

export type TableAlign = "left" | "right" | "center" | "auto";
type RenderableTableAlign = Exclude<TableAlign, "auto">;

type ParsedTable = {
  headerCells: string[];
  bodyRows: string[][];
  delimiterAlignments: TableAlign[];
  lastConsumedBreak: number;
};

export type TableCellWidthResolver = (cell: VkInlineParseResult, isHeader: boolean) => number;
export type TablePaddingFn = (paddingWidth: number) => { text: string; width: number };

const EMPTY_CELL: VkInlineParseResult = { text: "", items: [] };
const NORMAL_SPACE_WIDTH = 1;
const THIN_SPACE = "\u2009";
const HAIR_SPACE = "\u200A";
const THIN_SPACE_WIDTH = 0.5;
const HAIR_SPACE_WIDTH = 0.25;
const PADDING_UNIT_WIDTH = HAIR_SPACE_WIDTH;
const COLUMN_WIDTH_SEARCH_STEPS = 24;
const COLUMN_WIDTH_SEARCH_SPACES = 4;

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

const getCell = (row: VkInlineParseResult[], columnIndex: number): VkInlineParseResult =>
  row[columnIndex] ?? EMPTY_CELL;

const getCellText = (row: VkInlineParseResult[], columnIndex: number): string =>
  row[columnIndex]?.text ?? "";

const defaultCreatePadding: TablePaddingFn = (paddingWidth) => {
  if (paddingWidth <= 0) {
    return { text: "", width: 0 };
  }

  const quarterUnits = Math.max(1, Math.round(paddingWidth / PADDING_UNIT_WIDTH));
  const spaces = Math.floor(quarterUnits / 4);
  const remainder = quarterUnits % 4;
  const text =
    " ".repeat(spaces) +
    (remainder >= 2 ? THIN_SPACE : "") +
    (remainder % 2 === 1 ? HAIR_SPACE : "");
  const width =
    spaces * NORMAL_SPACE_WIDTH +
    (remainder >= 2 ? THIN_SPACE_WIDTH : 0) +
    (remainder % 2 === 1 ? HAIR_SPACE_WIDTH : 0);

  return { text, width };
};

const resolvePaddedCellWidth = (contentWidth: number, targetWidth: number, pad: TablePaddingFn): number =>
  contentWidth + pad(targetWidth - contentWidth).width;

const resolveAlignedCellWidth = (
  contentWidth: number,
  targetWidth: number,
  alignment: RenderableTableAlign,
  pad: TablePaddingFn,
): number => {
  if (targetWidth <= contentWidth) {
    return contentWidth;
  }

  const paddingWidth = targetWidth - contentWidth;
  if (alignment === "center") {
    const leftPadding = pad(paddingWidth / 2);
    const rightPadding = pad(paddingWidth - leftPadding.width);

    return contentWidth + leftPadding.width + rightPadding.width;
  }

  return resolvePaddedCellWidth(contentWidth, targetWidth, pad);
};

const COLUMN_WIDTH_CEIL_STEP = 0.5;

const resolveColumnWidth = (
  cellWidths: number[],
  alignments: RenderableTableAlign[],
  pad: TablePaddingFn,
): number => {
  const baseWidth = Math.ceil(Math.max(...cellWidths) / COLUMN_WIDTH_CEIL_STEP) * COLUMN_WIDTH_CEIL_STEP;
  let bestTargetWidth = baseWidth;
  let bestSpread = Number.POSITIVE_INFINITY;
  let bestOvershoot = Number.POSITIVE_INFINITY;

  for (let step = 0; step <= COLUMN_WIDTH_SEARCH_STEPS * COLUMN_WIDTH_SEARCH_SPACES; step += 1) {
    const candidateWidth = baseWidth + (step / COLUMN_WIDTH_SEARCH_STEPS) * NORMAL_SPACE_WIDTH;
    const paddedWidths = cellWidths.map((width, index) =>
      resolveAlignedCellWidth(width, candidateWidth, alignments[index], pad),
    );
    const spread = Math.max(...paddedWidths) - Math.min(...paddedWidths);
    const overshoot =
      paddedWidths.reduce((sum, width) => sum + (width - baseWidth), 0) / paddedWidths.length;

    if (
      spread < bestSpread ||
      (spread === bestSpread &&
        (overshoot < bestOvershoot ||
          (overshoot === bestOvershoot && candidateWidth < bestTargetWidth)))
    ) {
      bestTargetWidth = candidateWidth;
      bestSpread = spread;
      bestOvershoot = overshoot;
    }
  }

  return bestTargetWidth;
};

const resolveColumnWidths = (
  headerRow: VkInlineParseResult[],
  bodyRows: VkInlineParseResult[][],
  headerAlignments: RenderableTableAlign[],
  bodyAlignments: RenderableTableAlign[],
  resolveCellWidth: TableCellWidthResolver,
  pad: TablePaddingFn,
): number[] => {
  return headerRow.map((_, columnIndex) =>
    resolveColumnWidth([
      resolveCellWidth(getCell(headerRow, columnIndex), true),
      ...bodyRows.map((row) => resolveCellWidth(getCell(row, columnIndex), false)),
    ], [
      headerAlignments[columnIndex],
      ...bodyRows.map(() => bodyAlignments[columnIndex]),
    ], pad),
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

const padTableCell = (
  cell: VkInlineParseResult,
  width: number,
  alignment: RenderableTableAlign,
  isHeader: boolean,
  resolveCellWidth: TableCellWidthResolver,
  pad: TablePaddingFn,
): { rendered: string; leftPad: number } => {
  const textWidth = resolveCellWidth(cell, isHeader);
  if (width <= textWidth) {
    return { rendered: cell.text, leftPad: 0 };
  }

  const paddingWidth = width - textWidth;
  if (alignment === "right") {
    const leftPadding = pad(paddingWidth);
    return { rendered: leftPadding.text + cell.text, leftPad: leftPadding.text.length };
  }

  if (alignment === "center") {
    const leftPadding = pad(paddingWidth / 2);
    const rightPadding = pad(paddingWidth - leftPadding.width);

    return {
      rendered: leftPadding.text + cell.text + rightPadding.text,
      leftPad: leftPadding.text.length,
    };
  }

  const rightPadding = pad(paddingWidth);
  return { rendered: cell.text + rightPadding.text, leftPad: 0 };
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
  resolveCellWidth: TableCellWidthResolver,
  pad: TablePaddingFn,
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
      resolveCellWidth,
      pad,
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
  resolveCellWidth: TableCellWidthResolver;
  paddingFn?: TablePaddingFn;
}): VkInlineParseResult => {
  const pad = params.paddingFn ?? defaultCreatePadding;
  const headerRow = params.headerCells.map((cell) => params.parseInline(cell));
  const bodyRows = params.bodyRows.map((row) => row.map((cell) => params.parseInline(cell)));
  const bodyAlignments = resolveBodyAlignments(params.delimiterAlignments, bodyRows);
  const headerAlignments = [...bodyAlignments];
  const widths = resolveColumnWidths(
    headerRow,
    bodyRows,
    headerAlignments,
    bodyAlignments,
    params.resolveCellWidth,
    pad,
  );
  const renderedRows = [
    renderTableRow(headerRow, widths, headerAlignments, true, params.resolveCellWidth, pad),
    ...bodyRows.map((row) => renderTableRow(row, widths, bodyAlignments, false, params.resolveCellWidth, pad)),
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

const parseMarkdownTable = (context: VkMarkdownBlockRuleContext): ParsedTable | null => {
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

export const createMarkdownTableBlockRule = (
  resolveCellWidth: TableCellWidthResolver,
  paddingFn?: TablePaddingFn,
): VkMarkdownBlockRule => {
  return (context) => {
    const table = parseMarkdownTable(context);
    if (!table) {
      return null;
    }

    const rendered = renderMarkdownTable({
      headerCells: table.headerCells,
      bodyRows: table.bodyRows,
      delimiterAlignments: table.delimiterAlignments,
      parseInline: context.parseInline,
      resolveCellWidth,
      paddingFn,
    });

    return createBlockResult(
      context.chunk.length,
      table.lastConsumedBreak,
      rendered.text,
      rendered.items,
    );
  };
};

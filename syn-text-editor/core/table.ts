/**
 * Tables as pure functions. A table is one block; its cells hold spans. Editing inside a cell runs the ordinary
 * text ops on a one-block document made from the cell (`cellDoc`) and writes the result back (`withCell`).
 */
import { emptyCell, normaliseSpans, type Block, type Cell, type RichDoc, type Span } from "./model";
import { withBlocks, type Result } from "./ops";

export interface CellRef { b: number; r: number; c: number }
export const MAX_ROWS = 200;
export const MAX_COLS = 20;

export const newTable = (rows: number, cols: number, head = true): Block => ({
  type: "table",
  spans: [],
  ...(head ? { head: true as const } : {}),
  rows: Array.from({ length: Math.min(MAX_ROWS, Math.max(1, rows)) }, () => Array.from({ length: Math.min(MAX_COLS, Math.max(1, cols)) }, emptyCell)),
});

export const cellAt = (d: RichDoc, ref: CellRef): Cell | undefined => d.blocks[ref.b]?.rows?.[ref.r]?.[ref.c];

/** A cell as a one-paragraph document, so the text ops apply to it unchanged. */
export const cellDoc = (cell: Cell | undefined): RichDoc => ({
  version: 1,
  blocks: [{ type: "p", spans: cell?.spans ?? [], ...(cell?.align ? { align: cell.align } : {}) }],
});

/** The document with one cell's content replaced by what a one-block document holds (extra blocks become line breaks). */
export function withCell(d: RichDoc, ref: CellRef, sub: RichDoc): RichDoc {
  const spans: Span[] = [];
  sub.blocks.forEach((b, i) => { if (i) spans.push({ text: "\n" }); spans.push(...b.spans); });
  const head = sub.blocks[0];
  const align = head?.align && head.align !== "left" ? head.align : undefined;
  return mapCell(d, ref, () => ({ spans: normaliseSpans(spans), ...(align ? { align } : {}) }));
}

export function mapCell(d: RichDoc, ref: CellRef, fn: (c: Cell) => Cell): RichDoc {
  const t = d.blocks[ref.b];
  const cell = t?.rows?.[ref.r]?.[ref.c];
  if (!t?.rows || !cell) return d;
  const rows = t.rows.slice();
  const row = rows[ref.r].slice();
  row[ref.c] = fn(cell);
  rows[ref.r] = row;
  return replaceTable(d, ref.b, { ...t, rows });
}

function replaceTable(d: RichDoc, b: number, t: Block): RichDoc {
  const blocks = d.blocks.slice();
  blocks[b] = t;
  return withBlocks(d, blocks);
}

/** Add a row above (`where` 0) or below (1) row `r`. */
export function insertRow(d: RichDoc, b: number, r: number, where: 0 | 1): RichDoc {
  const t = d.blocks[b];
  if (!t?.rows || t.rows.length >= MAX_ROWS) return d;
  const cols = t.rows[0]?.length ?? 1;
  const rows = t.rows.slice();
  rows.splice(r + where, 0, Array.from({ length: cols }, emptyCell));
  return replaceTable(d, b, { ...t, rows });
}
export function insertCol(d: RichDoc, b: number, c: number, where: 0 | 1): RichDoc {
  const t = d.blocks[b];
  if (!t?.rows || (t.rows[0]?.length ?? 0) >= MAX_COLS) return d;
  const rows = t.rows.map((row) => { const n = row.slice(); n.splice(c + where, 0, emptyCell()); return n; });
  return replaceTable(d, b, { ...t, rows });
}
/** Remove a row; the last row takes the table with it. */
export function deleteRow(d: RichDoc, b: number, r: number): Result | RichDoc {
  const t = d.blocks[b];
  if (!t?.rows) return d;
  if (t.rows.length <= 1) return deleteTable(d, b);
  const rows = t.rows.slice();
  rows.splice(r, 1);
  return replaceTable(d, b, { ...t, rows });
}
export function deleteCol(d: RichDoc, b: number, c: number): Result | RichDoc {
  const t = d.blocks[b];
  if (!t?.rows) return d;
  if ((t.rows[0]?.length ?? 0) <= 1) return deleteTable(d, b);
  const rows = t.rows.map((row) => { const n = row.slice(); n.splice(c, 1); return n; });
  return replaceTable(d, b, { ...t, rows });
}
export function deleteTable(d: RichDoc, b: number): Result {
  const blocks = d.blocks.slice();
  blocks.splice(b, 1);
  const doc = withBlocks(d, blocks);
  return { doc, pos: { b: Math.min(b, doc.blocks.length - 1), o: 0 } };
}
export function toggleHead(d: RichDoc, b: number): RichDoc {
  const t = d.blocks[b];
  if (!t?.rows) return d;
  const n = { ...t };
  if (t.head) delete n.head; else n.head = true;
  return replaceTable(d, b, n);
}

/** Tab / Shift+Tab: the next or previous cell, `null` past the table's ends. */
export function stepCell(d: RichDoc, ref: CellRef, delta: 1 | -1): CellRef | null {
  const rows = d.blocks[ref.b]?.rows;
  if (!rows) return null;
  const cols = rows[0].length;
  const i = ref.r * cols + ref.c + delta;
  if (i < 0 || i >= rows.length * cols) return null;
  return { b: ref.b, r: Math.floor(i / cols), c: i % cols };
}

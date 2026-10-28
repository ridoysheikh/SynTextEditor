/**
 * The editor's surface: model blocks → DOM (the same classes and styles the viewer uses), the caret between the
 * two, and reading back what the browser typed itself (an input method composing Bangla or Chinese, autocorrect).
 *
 * Text blocks are plain `div`s. Atoms (rule, image, video, file, table) are `contenteditable=false` islands the
 * caret steps over; a table's cells are editing hosts of their own (`td[contenteditable=true]`).
 */
import { blockText, isAtom, spansText, type Block, type Cell, type Marks, type Span } from "../core/model";
import type { Pos } from "../core/ops";
import { blockClass, blockData, formatBytes, spanClass, spanStyle } from "../core/styles";
import type { CellRef } from "../core/table";

const FILE_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6"/></svg>';

/** A block's element — its frame (class, marker, data) is set by `frame`. */
export function buildBlock(b: Block): HTMLElement {
  const el = document.createElement("div");
  el.dataset.type = b.type;
  if (isAtom(b)) {
    el.contentEditable = "false";
    buildAtom(el, b);
    return el;
  }
  fillSpans(el, b.spans);
  return el;
}

/** Spans as elements carrying their formats in `data-m`; an empty run or a trailing line break gets a `<br>` to stand on. */
export function fillSpans(el: HTMLElement, spans: Span[]) {
  el.replaceChildren(...spans.map(buildSpan));
  if (!spans.length) el.append(document.createElement("br"));
  else if (spans[spans.length - 1].text.endsWith("\n")) {
    const tail = document.createElement("br");
    tail.dataset.tail = "";
    el.append(tail);
  }
}

function buildSpan(s: Span): HTMLElement {
  const { text, ...marks } = s;
  const el = document.createElement(marks.link ? "a" : "span");
  if (marks.link) (el as HTMLAnchorElement).href = marks.link;
  el.dataset.m = JSON.stringify(marks);
  const cls = spanClass(marks);
  if (cls) el.className = cls;
  Object.assign(el.style, spanStyle(marks));
  if (marks.script) {
    const inner = document.createElement(marks.script);
    inner.textContent = text;
    el.append(inner);
  } else el.textContent = text;
  return el;
}

function buildAtom(el: HTMLElement, b: Block) {
  if (b.type === "hr") { el.append(document.createElement("hr")); return; }
  if (b.type === "image" || b.type === "video") {
    const fig = document.createElement("figure");
    fig.className = "se-figure";
    if (b.width) fig.style.width = `${b.width}%`;
    const media = document.createElement(b.type === "image" ? "img" : "video") as HTMLImageElement | HTMLVideoElement;
    media.src = b.src ?? "";
    media.draggable = false;
    if (media instanceof HTMLImageElement) media.alt = b.alt ?? "";
    else { media.controls = true; media.preload = "metadata"; }
    fig.append(media);
    if (b.caption) {
      const cap = document.createElement("figcaption");
      cap.className = "se-caption";
      cap.textContent = b.caption;
      fig.append(cap);
    }
    const handle = document.createElement("span");
    handle.className = "se-resize";
    handle.dataset.resize = "";
    handle.title = "Drag to resize";
    fig.append(handle);
    el.append(fig);
    return;
  }
  if (b.type === "file") {
    const a = document.createElement("a");
    a.className = "se-file-link";
    a.href = b.src ?? "";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.innerHTML = FILE_ICON;
    const name = document.createElement("span");
    name.className = "se-file-name";
    name.textContent = b.name || b.src || "file";
    a.append(name);
    if (b.bytes !== undefined) {
      const size = document.createElement("span");
      size.className = "se-file-size";
      size.textContent = formatBytes(b.bytes);
      a.append(size);
    }
    el.append(a);
    return;
  }
  if (b.type === "table") {
    const table = document.createElement("table");
    table.className = "se-table";
    table.append(document.createElement("tbody"));
    el.append(table);
    patchTable(el, b);
  }
}

const cellsOf = new WeakMap<HTMLElement, Cell>();

/**
 * Bring a table's DOM up to date with its block, keeping every cell element it can — the cell being typed in
 * must survive a redraw, or it would lose focus on each keystroke.
 */
export function patchTable(el: HTMLElement, b: Block) {
  const tbody = el.querySelector("tbody")!;
  const rows = b.rows ?? [];
  while (tbody.rows.length > rows.length) tbody.deleteRow(-1);
  rows.forEach((row, r) => {
    const tr = tbody.rows[r] ?? tbody.insertRow();
    const tag = b.head && r === 0 ? "TH" : "TD";
    while (tr.cells.length > row.length) tr.deleteCell(-1);
    row.forEach((cell, c) => {
      let td = tr.cells[c] as HTMLTableCellElement | undefined;
      if (td && td.tagName !== tag) { const swap = document.createElement(tag.toLowerCase()) as HTMLTableCellElement; td.replaceWith(swap); td = swap; cellsOf.delete(swap); }
      if (!td) { td = document.createElement(tag.toLowerCase()) as HTMLTableCellElement; tr.append(td); }
      td.contentEditable = "true";
      td.dataset.r = String(r);
      td.dataset.c = String(c);
      if (cell.align) td.dataset.align = cell.align; else delete td.dataset.align;
      if (cellsOf.get(td) !== cell) {
        if (spansText(cell.spans) !== (td.textContent ?? "") || !sameRender(td, cell.spans)) fillSpans(td, cell.spans);
        cellsOf.set(td, cell);
      }
    });
  });
}
/** Whether a cell element already shows these spans (so a redraw can leave the caret's text node alone). */
function sameRender(td: HTMLElement, spans: Span[]): boolean {
  const els = Array.from(td.children).filter((x) => (x as HTMLElement).dataset.tail === undefined && x.tagName !== "BR") as HTMLElement[];
  if (els.length !== spans.length) return false;
  return spans.every((s, i) => {
    const { text, ...m } = s;
    return els[i].dataset.m === JSON.stringify(m) && els[i].textContent === text;
  });
}

/** Classes, data and list marker — they depend on the neighbours, so they're refreshed on every draw. */
export function frame(el: HTMLElement, b: Block, marker: string | null) {
  const cls = blockClass(b);
  if (el.className !== cls) el.className = cls;
  const data = blockData(b);
  for (const k of ["align", "indent", "checked"]) {
    if (data[k] === undefined) delete el.dataset[k];
    else if (el.dataset[k] !== data[k]) el.dataset[k] = data[k];
  }
  if (marker !== null && el.dataset.marker !== marker) el.dataset.marker = marker;
  else if (marker === null) delete el.dataset.marker;
}

// ── positions ────────────────────────────────────────────────────────────────

const blockOf = (root: HTMLElement, node: Node): HTMLElement | null => {
  let n: Node | null = node;
  while (n && n.parentNode !== root) n = n.parentNode;
  return n as HTMLElement | null;
};

/** The cell a DOM point is in, if any. */
export function cellOf(root: HTMLElement, node: Node | null): { ref: CellRef; td: HTMLElement } | null {
  const el = (node?.nodeType === Node.ELEMENT_NODE ? node as Element : node?.parentElement)?.closest?.("td[data-r],th[data-r]") as HTMLElement | null;
  if (!el || !root.contains(el)) return null;
  const blk = blockOf(root, el);
  if (!blk) return null;
  return { ref: { b: Array.prototype.indexOf.call(root.children, blk), r: Number(el.dataset.r), c: Number(el.dataset.c) }, td: el };
}
export const cellElement = (root: HTMLElement, ref: CellRef): HTMLElement | null =>
  (root.children[ref.b] as HTMLElement | undefined)?.querySelector(`[data-r="${ref.r}"][data-c="${ref.c}"]`) ?? null;

/** Characters from the start of `el` to a DOM point. */
function offsetIn(el: HTMLElement, node: Node, offset: number): number {
  const r = document.createRange();
  r.setStart(el, 0);
  try { r.setEnd(node, offset); } catch { return 0; }
  return r.toString().length;
}

/** A DOM point → a model position (block index, character offset). A point inside an atom is the atom. */
export function posFromDom(root: HTMLElement, node: Node | null, offset: number): Pos | null {
  if (!node || !root.contains(node)) return null;
  const count = root.children.length;
  if (!count) return null;
  if (node === root) {
    if (offset >= count) { const last = root.children[count - 1] as HTMLElement; return { b: count - 1, o: textLength(last) }; }
    return { b: offset, o: 0 };
  }
  const el = blockOf(root, node);
  if (!el) return null;
  const b = Array.prototype.indexOf.call(root.children, el);
  if (el.contentEditable === "false") return { b, o: 0 };
  return { b, o: offsetIn(el, node, offset) };
}
/** A DOM point inside a cell → the offset in the cell's text. */
export const offsetInCell = (td: HTMLElement, node: Node, offset: number) => offsetIn(td, node, offset);

const textLength = (el: HTMLElement) => (el.contentEditable === "false" ? 0 : (el.textContent ?? "").length);

/** A model position → a DOM point for the browser's selection. */
export function domFromPos(root: HTMLElement, p: Pos): [Node, number] | null {
  const el = root.children[p.b] as HTMLElement | undefined;
  if (!el) return null;
  if (el.contentEditable === "false") return [root, p.b];
  return pointIn(el, p.o);
}
/** The text node and offset `o` characters into an element. */
export function pointIn(el: HTMLElement, o: number): [Node, number] {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let at = 0;
  let last: Text | null = null;
  for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) {
    if (o <= at + t.length) return [t, o - at];
    at += t.length;
    last = t;
  }
  return last ? [last, last.length] : [el, 0];
}

/** What an element holds now as spans — after the browser edited it itself. */
export function readSpans(el: HTMLElement, orphan: Marks): Span[] {
  const spans: Span[] = [];
  const marksFor = (n: Node): Marks => {
    const host = (n.parentElement?.closest("[data-m]") ?? null) as HTMLElement | null;
    if (!host || !el.contains(host)) return orphan;
    try { return JSON.parse(host.dataset.m ?? "{}"); } catch { return orphan; }
  };
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) {
      const text = (n as Text).data.replace(/ /g, " ").replace(/​/g, "");
      if (text) spans.push({ ...marksFor(n), text });
    } else if ((n as Element).tagName === "BR") {
      const br = n as HTMLElement;
      if (br.dataset.tail === undefined && el.textContent) spans.push({ ...marksFor(br), text: "\n" });
    }
  }
  return spans;
}
export const readBlock = (el: HTMLElement, b: Block, orphan: Marks): Block => ({ ...b, spans: readSpans(el, orphan) });

/** The text a block element shows (line breaks included, the trailing placeholder not). */
export const shownText = (el: HTMLElement) => (el.contentEditable === "false" ? "" : (el.textContent ?? ""));
export const modelText = (b: Block) => (isAtom(b) ? "" : blockText(b));

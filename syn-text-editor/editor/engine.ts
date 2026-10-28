/**
 * The editor. The document model is the truth: keys, deletes, paste, drop and the toolbar run an operation
 * (core/ops) on it and the surface redraws the blocks that changed. The browser edits the DOM itself only where it
 * must — an input method composing (Bangla, Chinese…), autocorrect — and the result is read back into the model.
 *
 * Text commands run on a "view": the main document, or — while the caret is in a table cell — a one-block document
 * made from that cell, written back into the table after. So every format, the clipboard and undo work in cells
 * with no code of their own.
 */
import { clipboardHtml, parseHtml } from "../core/html";
import {
  BLOCK_SIZE, blockLength, clampSize, clampWidth, cleanBlock, docLength, docToPlain, docWords, emptyBlock, emptyDoc, isAtom,
  isEmptyDoc, marksOf, normaliseSpans, plainToBlocks,
  type Align, type Block, type ListKind, type Marks, type RichDoc, type Schema, type Span, type TextType, type Toggle,
} from "../core/model";
import * as ops from "../core/ops";
import { caret, cmp, isCollapsed, ordered, type Active, type Pos, type Sel } from "../core/ops";
import { listMarkers } from "../core/styles";
import * as tables from "../core/table";
import { cellAt, cellDoc, withCell, type CellRef } from "../core/table";
import {
  buildBlock, cellElement, cellOf, domFromPos, frame, modelText, offsetInCell, patchTable, pointIn, posFromDom, readBlock, readSpans, shownText,
} from "./dom";

export interface EditorState {
  active: Active;
  canUndo: boolean;
  canRedo: boolean;
  /** the format painter holds formats and waits for a selection */
  painting: boolean;
  link: string | null;
  /** characters of text */
  length: number;
  words: number;
  /** the atom (image, table, rule…) selected as a whole, by block index */
  atom: number | null;
  /** the table cell the caret is in */
  cell: CellRef | null;
  focused: boolean;
  /** the document has no text */
  empty: boolean;
}
export interface EngineOptions {
  schema: Schema;
  readOnly?: boolean;
  onChange: (doc: RichDoc) => void;
  /** Files pasted or dropped. `near` is the block they land after (null: at the caret). */
  onFiles?: (files: File[], near: Block | null) => void;
  onFocusChange?: (focused: boolean) => void;
  /** Undo steps kept (default 300). */
  history?: number;
}
type Kind = "type" | "space" | "delete" | "size" | "other";
interface CellSel { ref: CellRef; sel: Sel }
interface Snapshot { doc: RichDoc; sel: Sel; cell: CellSel | null }
interface Painter { marks: Marks; block: Pick<Block, "type" | "align" | "list" | "indent"> }

const MIME = "application/x-syn-blocks";
/** The last thing copied from any editor on the page — browsers rewrite clipboard HTML, so the exact blocks ride here too. */
let lastCopy: { plain: string; blocks: Block[] } | null = null;
const sameRef = (a: CellRef | null | undefined, b: CellRef | null | undefined) => !!a && !!b && a.b === b.b && a.r === b.r && a.c === b.c;
const hasHighlights = () => typeof CSS !== "undefined" && "highlights" in CSS && typeof (globalThis as { Highlight?: unknown }).Highlight === "function";

/** An atom may not end the document — there'd be nowhere to type after it. */
const withTail = (d: RichDoc): RichDoc => (isAtom(d.blocks[d.blocks.length - 1]) ? { version: 1, blocks: [...d.blocks, emptyBlock()] } : d);

export class RichEngine {
  doc: RichDoc;
  sel: Sel = caret({ b: 0, o: 0 });
  private cell: CellSel | null = null;
  private stored: Marks | null = null;
  private readonly cache = new WeakMap<Block, HTMLElement>();
  private drawn: Block[] = [];
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private lastKind: Kind | null = null;
  private lastTime = 0;
  private composing = false;
  private plainPaste = false;
  private dragging = false;
  private resizing = false;
  private painter: Painter | null = null;
  private listeners = new Set<() => void>();
  private state: EditorState;
  private readOnly: boolean;
  private focused = false;
  private readonly off: (() => void)[] = [];

  constructor(private readonly root: HTMLElement, doc: RichDoc, private readonly opts: EngineOptions) {
    this.doc = withTail(doc.blocks.length ? doc : emptyDoc());
    this.readOnly = !!opts.readOnly;
    this.state = this.compute();
    root.contentEditable = this.readOnly ? "false" : "true";
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void) => {
      root.addEventListener(type, fn as EventListener);
      this.off.push(() => root.removeEventListener(type, fn as EventListener));
    };
    on("beforeinput", (e) => this.onBeforeInput(e));
    on("input", () => this.onInput());
    on("keydown", (e) => this.onKeyDown(e));
    on("compositionstart", () => this.onCompositionStart());
    on("compositionend", () => this.onCompositionEnd());
    on("paste", (e) => this.onPaste(e));
    on("copy", (e) => this.onCopy(e, false));
    on("cut", (e) => this.onCopy(e, true));
    on("dragstart", (e) => this.onDragStart(e));
    on("dragend", () => { this.dragging = false; });
    on("dragover", (e) => { if (!this.readOnly) e.preventDefault(); });
    on("drop", (e) => this.onDrop(e));
    on("mousedown", (e) => this.onMouseDown(e));
    on("mouseup", () => this.onMouseUp());
    on("click", (e) => this.onClick(e));
    on("focusin", () => this.setFocused(true));
    on("focusout", (e) => { if (!root.contains(e.relatedTarget as Node | null)) { this.onSelectionChange(); this.setFocused(false); } });
    const sel = () => this.onSelectionChange();
    document.addEventListener("selectionchange", sel);
    this.off.push(() => document.removeEventListener("selectionchange", sel));
    this.render();
  }

  destroy() { this.off.forEach((f) => f()); this.listeners.clear(); this.clearFind(); }
  setReadOnly(readOnly: boolean) {
    this.readOnly = readOnly;
    this.root.contentEditable = readOnly ? "false" : "true";
    this.root.querySelectorAll<HTMLElement>("td[data-r],th[data-r]").forEach((td) => { td.contentEditable = readOnly ? "false" : "true"; });
  }
  get isReadOnly() { return this.readOnly; }
  /** What the editor allows from now on (typing, paste, shortcuts). */
  setSchema(schema: Schema) { this.opts.schema = schema; }

  /**
   * Before a context menu: an image, video, file, rule or table under the pointer is selected as a whole (as a
   * click would); otherwise the browser's selection — which a right-click may have just moved — is read in.
   */
  prepareContextMenu(target: Element | null) {
    const blockEl = target ? Array.from(this.root.children).find((k) => k.contains(target)) : undefined;
    if (blockEl && !target!.closest("td,th")) {
      const b = Array.prototype.indexOf.call(this.root.children, blockEl);
      if (isAtom(this.doc.blocks[b])) { this.selectAtom(b); return; }
    }
    this.catchUp();
    this.notify();
  }
  /** Where the caret (or the selected atom) is on screen — for a menu opened from the keyboard. */
  caretPoint(): { x: number; y: number } {
    const atom = this.cell ? null : this.atomIndex();
    const el = atom !== null ? this.root.children[atom] : null;
    const s = window.getSelection();
    const r = el?.getBoundingClientRect()
      ?? (s?.rangeCount && this.root.contains(s.anchorNode) ? (s.getRangeAt(0).getClientRects()[0] ?? s.getRangeAt(0).getBoundingClientRect()) : null)
      ?? this.root.getBoundingClientRect();
    return { x: Math.round(r.left + (el ? r.width / 2 : 0)), y: Math.round(r.bottom + 2) };
  }

  // ── state for the toolbar ────────────────────────────────────────────────
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getState = () => this.state;
  private compute(): EditorState {
    const { doc, sel } = this.view();
    const [from, to] = ordered(sel);
    const lr = isCollapsed(sel) ? ops.linkRange(doc, from) : null;
    return {
      active: ops.activeIn(doc, from, to, isCollapsed(sel) ? this.stored : null),
      canUndo: this.undoStack.length > 0, canRedo: this.redoStack.length > 0, painting: !!this.painter,
      link: lr ? ops.marksAt(doc, { b: lr[0].b, o: lr[0].o + 1 }).link ?? null : ops.activeIn(doc, from, to, null).marks.link ?? null,
      length: docLength(this.doc), words: docWords(this.doc),
      atom: this.cell ? null : this.atomIndex(), cell: this.cell?.ref ?? null, focused: this.focused, empty: isEmptyDoc(this.doc),
    };
  }
  private notify() { this.state = this.compute(); this.markAtom(); this.listeners.forEach((f) => f()); }
  private setFocused(f: boolean) {
    if (this.focused === f) return;
    this.focused = f;
    this.opts.onFocusChange?.(f);
    this.notify();
  }

  /** A value set from outside (form reset, a record loaded): no history, caret kept where it can be. */
  setDoc(doc: RichDoc) {
    this.doc = withTail(doc.blocks.length ? doc : emptyDoc());
    this.undoStack = [];
    this.redoStack = [];
    this.cell = null;
    this.sel = { anchor: ops.clampPos(this.doc, this.sel.anchor), focus: ops.clampPos(this.doc, this.sel.focus) };
    this.render();
    this.notify();
  }

  /** The block index of the atom selected as a whole, if any. */
  private atomIndex(sel: Sel = this.sel): number | null {
    const [from, to] = ordered(sel);
    if (from.o !== 0 || !isAtom(this.doc.blocks[from.b])) return null;
    return (to.b === from.b + 1 && to.o === 0) || cmp(from, to) === 0 ? from.b : null;
  }
  private atomSel = (b: number): Sel => ({ anchor: { b, o: 0 }, focus: { b: b + 1, o: 0 } });

  // ── the view: the main document, or the cell the caret is in ─────────────
  private view(): { doc: RichDoc; sel: Sel } {
    if (this.cell) return { doc: cellDoc(cellAt(this.doc, this.cell.ref)), sel: this.cell.sel };
    return { doc: this.doc, sel: this.sel };
  }
  /** Write a changed view back: into the cell, or as the document. */
  private put(doc: RichDoc, sel: Sel, kind: Kind) {
    if (this.cell) this.commit(withCell(this.doc, this.cell.ref, doc), this.sel, kind, { ref: this.cell.ref, sel });
    else this.commit(doc, sel, kind, null);
  }
  /** A DOM point → a position in the view. */
  private viewPos(node: Node, offset: number): Pos | null {
    if (this.cell) {
      const c = cellOf(this.root, node);
      return c && sameRef(c.ref, this.cell.ref) ? { b: 0, o: offsetInCell(c.td, node, offset) } : null;
    }
    return posFromDom(this.root, node, offset);
  }
  /** The main-document position for block-level actions: a cell's table counts as where the caret is. */
  private mainRange(): [Pos, Pos] {
    if (this.cell) { const p = { b: this.cell.ref.b, o: 0 }; return [p, p]; }
    return ordered(this.sel);
  }

  // ── drawing ──────────────────────────────────────────────────────────────
  private render() {
    const blocks = this.doc.blocks;
    const markers = listMarkers(blocks);
    const used = new Set<HTMLElement>();
    const els = blocks.map((b, i) => {
      let el = this.cache.get(b);
      if (el && used.has(el)) el = undefined;
      if (!el && b.type === "table") {
        // A changed table keeps its element (and the focused cell in it) — the block before it at this place.
        const was = this.drawn[i];
        const old = was?.type === "table" ? this.cache.get(was) : undefined;
        if (old && !used.has(old)) { patchTable(old, b); el = old; this.cache.set(b, el); }
      }
      if (!el) { el = buildBlock(b); this.cache.set(b, el); }
      used.add(el);
      frame(el, b, markers[i]);
      return el;
    });
    this.drawn = blocks;
    const kids = this.root.children;
    if (kids.length !== els.length || els.some((el, i) => kids[i] !== el)) {
      // Elements already in place stay — moving the focused cell's table would drop focus.
      els.forEach((el, i) => { if (this.root.children[i] !== el) this.root.insertBefore(el, this.root.children[i] ?? null); });
      while (this.root.children.length > els.length) this.root.lastElementChild!.remove();
    }
    if (this.readOnly) this.setReadOnly(true);
    this.root.toggleAttribute("data-empty", isEmptyDoc(this.doc) && blocks.length === 1);
    this.markAtom();
    if (this.hasFocus()) this.applySelection();
  }

  private markAtom() {
    const at = this.cell ? null : this.atomIndex();
    Array.from(this.root.children).forEach((el, i) => (el as HTMLElement).toggleAttribute("data-selected", i === at));
  }

  hasFocus() { return !!document.activeElement && this.root.contains(document.activeElement); }

  private applySelection() {
    const s = window.getSelection();
    if (!s) return;
    if (this.cell) {
      const td = cellElement(this.root, this.cell.ref);
      if (!td) return;
      if (document.activeElement !== td) td.focus({ preventScroll: true });
      const a = pointIn(td, this.cell.sel.anchor.o);
      const f = pointIn(td, this.cell.sel.focus.o);
      if (s.anchorNode === a[0] && s.anchorOffset === a[1] && s.focusNode === f[0] && s.focusOffset === f[1]) return;
      try { s.setBaseAndExtent(a[0], a[1], f[0], f[1]); } catch { /* the node went away mid-draw */ }
      return;
    }
    if (document.activeElement !== this.root && !this.readOnly) this.root.focus({ preventScroll: true });
    const atom = this.atomIndex();
    if (atom !== null) {
      if (s.anchorNode === this.root && s.anchorOffset === atom && s.focusNode === this.root && s.focusOffset === atom + 1) return;
      try { s.setBaseAndExtent(this.root, atom, this.root, atom + 1); } catch { /* ignore */ }
      return;
    }
    const a = domFromPos(this.root, this.sel.anchor);
    const f = domFromPos(this.root, this.sel.focus);
    if (!a || !f) return;
    if (s.anchorNode === a[0] && s.anchorOffset === a[1] && s.focusNode === f[0] && s.focusOffset === f[1]) return;
    try { s.setBaseAndExtent(a[0], a[1], f[0], f[1]); } catch { /* the node went away mid-draw */ }
  }

  /** The browser's selection → the model's (null when it's outside the editor). */
  private readSelection(doc: RichDoc = this.doc): { sel: Sel; cell: CellSel | null } | null {
    const s = window.getSelection();
    if (!s || !s.anchorNode || !this.root.contains(s.anchorNode)) return null;
    const ca = cellOf(this.root, s.anchorNode);
    const cf = cellOf(this.root, s.focusNode);
    if (ca && cf && sameRef(ca.ref, cf.ref)) {
      const len = blockLength(cellDoc(cellAt(doc, ca.ref)).blocks[0]);
      const clamp = (o: number) => Math.max(0, Math.min(len, o));
      return {
        sel: caret({ b: ca.ref.b, o: 0 }),
        cell: { ref: ca.ref, sel: { anchor: { b: 0, o: clamp(offsetInCell(ca.td, s.anchorNode, s.anchorOffset)) }, focus: { b: 0, o: clamp(offsetInCell(cf.td, s.focusNode!, s.focusOffset)) } } },
      };
    }
    const anchor = posFromDom(this.root, s.anchorNode, s.anchorOffset);
    const focus = posFromDom(this.root, s.focusNode, s.focusOffset);
    if (!anchor || !focus) return null;
    let sel: Sel = { anchor: ops.clampPos(doc, anchor), focus: ops.clampPos(doc, focus) };
    if (isCollapsed(sel) && isAtom(doc.blocks[sel.anchor.b])) sel = this.atomSel(sel.anchor.b);   // the caret on an atom selects it
    return { sel, cell: null };
  }
  private sameSel(a: { sel: Sel; cell: CellSel | null }) {
    if (!!a.cell !== !!this.cell) return false;
    if (a.cell && this.cell) return sameRef(a.cell.ref, this.cell.ref) && !cmp(a.cell.sel.anchor, this.cell.sel.anchor) && !cmp(a.cell.sel.focus, this.cell.sel.focus);
    return !cmp(a.sel.anchor, this.sel.anchor) && !cmp(a.sel.focus, this.sel.focus);
  }

  /** `selectionchange` arrives later than keys and clipboard events: read the selection now. */
  private catchUp() {
    const fresh = this.readSelection();
    if (fresh && !this.sameSel(fresh)) { this.sel = fresh.sel; this.cell = fresh.cell; this.stored = null; }
  }

  private onSelectionChange() {
    if (this.composing || this.resizing) return;
    const next = this.readSelection();
    if (!next) return;
    if (!this.sameSel(next)) {
      const toAtom = !next.cell && this.atomIndex(next.sel) !== null;
      this.sel = next.sel;
      this.cell = next.cell;
      this.stored = null;
      this.lastKind = null;
      if (toAtom) this.applySelection();
      this.notify();
    }
  }

  focus() {
    if (this.cell) { cellElement(this.root, this.cell.ref)?.focus({ preventScroll: true }); }
    else if (document.activeElement !== this.root) this.root.focus({ preventScroll: true });
    this.applySelection();
  }
  blur() { (document.activeElement as HTMLElement | null)?.blur?.(); }

  /** Put the caret (or a range) somewhere in the main document. */
  select(sel: Sel) {
    this.cell = null;
    this.sel = { anchor: ops.clampPos(this.doc, sel.anchor), focus: ops.clampPos(this.doc, sel.focus) };
    this.stored = null;
    this.focus();
    this.notify();
  }
  selectAll() { this.select({ anchor: { b: 0, o: 0 }, focus: ops.docEnd(this.doc) }); }
  getSelection(): Sel { return this.sel; }

  // ── changing the document ────────────────────────────────────────────────
  private commit(doc: RichDoc, sel: Sel, kind: Kind, cell: CellSel | null = null) {
    doc = withTail(doc);
    if (doc === this.doc && !cmp(sel.anchor, this.sel.anchor) && !cmp(sel.focus, this.sel.focus) && sameRef(cell?.ref, this.cell?.ref) === !!cell
      && (!cell || !this.cell || (!cmp(cell.sel.anchor, this.cell.sel.anchor) && !cmp(cell.sel.focus, this.cell.sel.focus)))) return;
    const now = Date.now();
    const joins = (kind === "type" && this.lastKind === "type") || (kind === "size" && this.lastKind === "size") || (kind === "delete" && this.lastKind === "delete");
    if (doc !== this.doc && !(joins && now - this.lastTime < 1200)) {
      this.undoStack.push({ doc: this.doc, sel: this.sel, cell: this.cell });
      if (this.undoStack.length > (this.opts.history ?? 300)) this.undoStack.shift();
      this.redoStack = [];
    }
    this.lastKind = kind;
    this.lastTime = now;
    const changed = doc !== this.doc;
    this.doc = doc;
    this.sel = { anchor: ops.clampPos(doc, sel.anchor), focus: ops.clampPos(doc, sel.focus) };
    this.cell = cell && cellAt(doc, cell.ref) ? cell : null;
    // A caret left on an atom selects it.
    if (!this.cell && isCollapsed(this.sel) && isAtom(doc.blocks[this.sel.anchor.b])) this.sel = this.atomSel(this.sel.anchor.b);
    this.render();
    this.notify();
    if (changed) this.opts.onChange(doc);
  }

  undo() { this.travel(this.undoStack, this.redoStack); }
  redo() { this.travel(this.redoStack, this.undoStack); }
  private travel(from: Snapshot[], to: Snapshot[]) {
    const snap = from.pop();
    if (!snap) return;
    to.push({ doc: this.doc, sel: this.sel, cell: this.cell });
    this.doc = snap.doc;
    this.sel = snap.sel;
    this.cell = snap.cell && cellAt(snap.doc, snap.cell.ref) ? snap.cell : null;
    this.lastKind = null;
    this.stored = null;
    this.render();
    this.focus();
    this.notify();
    this.opts.onChange(this.doc);
  }

  private typeText(text: string) {
    const { doc: d, sel } = this.view();
    const [from, to] = ordered(sel);
    const marks = this.stored ?? ops.marksAt(d, from);
    let doc = d;
    let pos = from;
    if (cmp(from, to)) ({ doc, pos } = ops.deleteRange(doc, from, to));
    if (text === " " && !cmp(from, to) && !this.cell) {
      const auto = ops.autoFormat(doc, pos, (f) => this.allows(f));
      if (auto) { this.stored = null; this.put(auto.doc, caret(auto.pos), "other"); return; }
    }
    const r = ops.insertText(doc, pos, text, marks);
    this.stored = null;
    this.put(r.doc, caret(r.pos), /\s/.test(text) ? "space" : "type");
  }
  /** Whether the schema has what an auto-format start would make. */
  private allows(f: Partial<Block>) {
    const s = this.opts.schema;
    return (!f.list || s.has(f.list)) && (!f.type || s.has(f.type));
  }

  private insertFragment(blocks: Block[], at?: Pos) {
    const { doc: d, sel } = this.view();
    let [from, to] = ordered(sel);
    let doc = d;
    if (this.cell) blocks = blocks.filter((b) => !isAtom(b));
    if (at) from = to = at;
    else if (cmp(from, to)) { const r = ops.deleteRange(doc, from, to); doc = r.doc; from = r.pos; }
    const r = ops.insertBlocks(doc, from, blocks);
    this.put(r.doc, caret(r.pos), "other");
  }

  private deleteFor(type: string, e: InputEvent) {
    const atom = this.cell ? null : this.atomIndex();
    if (atom !== null) { this.removeAtom(atom); return; }
    const { doc, sel } = this.view();
    const [from, to] = ordered(sel);
    if (cmp(from, to)) { const r = ops.deleteRange(doc, from, to); this.put(r.doc, caret(r.pos), "delete"); return; }
    const backward = type.includes("Backward");
    if (this.cell && ((backward && from.o === 0) || (!backward && from.o >= blockLength(doc.blocks[0])))) return;   // a cell's edges hold
    if (backward && from.o === 0) { const r = ops.joinBackward(doc, from); this.put(r.doc, caret(r.pos), "other"); return; }
    if (!backward && from.o >= blockLength(doc.blocks[from.b])) { const r = ops.joinForward(doc, from); this.put(r.doc, caret(r.pos), "other"); return; }
    // The browser knows what a "character", "word" or "line" is here (grapheme clusters, Bangla) — use its range.
    const target = e.getTargetRanges?.()[0];
    let a: Pos | null = null;
    let z: Pos | null = null;
    if (target) {
      a = this.viewPos(target.startContainer, target.startOffset);
      z = this.viewPos(target.endContainer, target.endOffset);
    }
    if (!a || !z || cmp(a, z) >= 0) {
      const text = modelText(doc.blocks[from.b]);
      const step = (o: number, dir: number) => {
        const c = text.charCodeAt(dir < 0 ? o - 1 : o);
        return dir * (c >= 0xdc00 && c <= 0xdfff && dir < 0 ? 2 : c >= 0xd800 && c <= 0xdbff && dir > 0 ? 2 : 1);
      };
      if (type.includes("Word")) {
        const re = backward ? /\S*\s*$/ : /^\s*\S*/;
        const piece = backward ? text.slice(0, from.o).match(re)?.[0] ?? "" : text.slice(from.o).match(re)?.[0] ?? "";
        a = backward ? { b: from.b, o: from.o - Math.max(1, piece.length) } : from;
        z = backward ? from : { b: from.b, o: from.o + Math.max(1, piece.length) };
      } else if (type.includes("Line")) {
        a = backward ? { b: from.b, o: 0 } : from;
        z = backward ? from : { b: from.b, o: text.length };
      } else {
        a = backward ? { b: from.b, o: from.o + step(from.o, -1) } : from;
        z = backward ? from : { b: from.b, o: from.o + step(from.o, 1) };
      }
    }
    const r = ops.deleteRange(doc, ops.clampPos(doc, a), ops.clampPos(doc, z));
    this.put(r.doc, caret(r.pos), "delete");
  }

  private enter() {
    const atom = this.cell ? null : this.atomIndex();
    if (atom !== null) { this.caretAfter(atom); return; }
    const { doc, sel } = this.view();
    const [from, to] = ordered(sel);
    const cut = ops.deleteRange(doc, from, to);
    const blk = cut.doc.blocks[cut.pos.b];
    if (this.cell) { this.typeText("\n"); return; }
    if (blk.type === "code") {
      // Enter in code is a new line; on an empty last line it leaves the block.
      const text = modelText(blk);
      if (cut.pos.o === text.length && text.endsWith("\n")) {
        const trimmed = ops.deleteRange(cut.doc, { b: cut.pos.b, o: text.length - 1 }, cut.pos);
        const r = ops.splitBlock(trimmed.doc, trimmed.pos);
        this.put(r.doc, caret(r.pos), "other");
        return;
      }
      const r = ops.insertText(cut.doc, cut.pos, "\n", this.stored ?? ops.marksAt(cut.doc, cut.pos));
      this.put(r.doc, caret(r.pos), "type");
      return;
    }
    const r = ops.splitBlock(cut.doc, cut.pos);
    this.put(r.doc, caret(r.pos), "other");
  }

  /** The caret at the start of the block after `b` (a new line when there's none, or an atom follows). */
  private caretAfter(b: number) {
    let doc = this.doc;
    if (!doc.blocks[b + 1] || isAtom(doc.blocks[b + 1])) {
      const blocks = doc.blocks.slice();
      blocks.splice(b + 1, 0, emptyBlock());
      doc = { version: 1, blocks };
    }
    this.commit(doc, caret({ b: b + 1, o: 0 }), "other");
  }
  private caretBefore(b: number) {
    let doc = this.doc;
    if (b === 0 || isAtom(doc.blocks[b - 1])) {
      const blocks = doc.blocks.slice();
      blocks.splice(b, 0, emptyBlock());
      doc = { version: 1, blocks };
      this.commit(doc, caret({ b, o: 0 }), "other");
      return;
    }
    this.commit(doc, caret({ b: b - 1, o: blockLength(doc.blocks[b - 1]) }), "other");
  }

  // ── commands (the toolbar and keyboard) ──────────────────────────────────
  /** Marks on the range — or, at a bare caret, on what's typed next. */
  private marks(apply: (d: RichDoc, a: Pos, z: Pos) => RichDoc, forCaret: (m: Marks) => Marks, kind: Kind = "other", refocus = true) {
    const { doc, sel } = this.view();
    const [from, to] = ordered(sel);
    if (!cmp(from, to)) {
      this.stored = forCaret({ ...(this.stored ?? ops.marksAt(doc, from)) });
      this.notify();
    } else this.put(apply(doc, from, to), sel, kind);
    if (refocus) this.focus();
  }
  toggle(key: Toggle) {
    const on = !this.state.active.marks[key];
    this.marks((d, a, z) => ops.toggleMark(d, a, z, key), (m) => { if (on) m[key] = true; else delete m[key]; return m; });
  }
  setScript(script: "sub" | "sup") {
    const next = this.state.active.marks.script === script ? undefined : script;
    this.marks((d, a, z) => ops.setMark(d, a, z, "script", next), (m) => { if (next) m.script = next; else delete m.script; return m; });
  }
  setMark(key: "color" | "highlight" | "font", value: string | null) {
    this.marks((d, a, z) => ops.setMark(d, a, z, key, value ?? undefined), (m) => { if (value) m[key] = value; else delete m[key]; return m; });
  }
  setColor(c: string | null) { this.setMark("color", c); }
  setHighlight(c: string | null) { this.setMark("highlight", c); }
  setFont(f: string | null) { this.setMark("font", f); }
  /** An exact size in px; `refocus: false` while it's being typed in the size box. */
  setSize(px: number | null, refocus = true) {
    const { doc, sel } = this.view();
    const base = BLOCK_SIZE[doc.blocks[ordered(sel)[0].b]?.type ?? "p"];
    const size = px === null ? null : clampSize(px);
    this.marks((d, a, z) => ops.mapSpans(d, a, z, (s, b) => {
      const n: Span = { ...s };
      if (size === null || size === BLOCK_SIZE[b.type]) delete n.size; else n.size = size;
      return n;
    }), (m) => { if (size === null || size === base) delete m.size; else m.size = size; return m; }, "size", refocus);
  }
  stepSize(delta: number) {
    const { doc, sel } = this.view();
    const base = BLOCK_SIZE[doc.blocks[ordered(sel)[0].b]?.type ?? "p"];
    this.marks((d, a, z) => ops.stepSize(d, a, z, delta), (m) => {
      const size = clampSize((m.size ?? base) + delta);
      if (size === base) delete m.size; else m.size = size;
      return m;
    }, "size");
  }
  clearFormatting() {
    this.marks((d, a, z) => ops.clearMarks(d, a, z), () => ({}));
  }
  private blocks(apply: (d: RichDoc, a: Pos, z: Pos) => RichDoc) {
    if (this.cell) return void this.focus();                 // block kinds don't apply inside a cell
    const [from, to] = ordered(this.sel);
    this.commit(apply(this.doc, from, to), this.sel, "other");
    this.focus();
  }
  setBlock(type: TextType) { this.blocks((d, a, z) => ops.setBlockType(d, a, z, type)); }
  setAlign(align: Align) {
    if (this.cell) {
      const { ref, sel } = this.cell;
      this.commit(tables.mapCell(this.doc, ref, (c) => ({ ...c, align: align === "left" ? undefined : align })), this.sel, "other", { ref, sel });
      this.focus();
      return;
    }
    const atom = this.atomIndex();
    if (atom !== null) { this.updateAtom({ align: align === "center" || align === "justify" ? undefined : align }); return; }
    this.blocks((d, a, z) => ops.setAlign(d, a, z, align));
  }
  toggleList(kind: ListKind) { this.blocks((d, a, z) => ops.toggleList(d, a, z, kind)); }
  indent(delta: number) { this.blocks((d, a, z) => ops.indent(d, a, z, delta)); }
  toggleChecked(b: number) { this.commit(ops.toggleChecked(this.doc, b), this.sel, "other", this.cell); }

  /** Insert a block that isn't text (rule, image, video, file, table) at the caret; a table puts the caret in its first cell. */
  insertAtom(atom: Block, near?: Block | null) {
    const clean = atom.type === "table" ? atom : cleanBlock(atom, this.opts.schema);
    if (!clean) return;
    const nearAt = near ? this.doc.blocks.indexOf(near) : -1;
    const [from, to] = this.mainRange();
    let doc = this.doc;
    let pos = from;
    if (nearAt >= 0) pos = { b: nearAt, o: blockLength(this.doc.blocks[nearAt]) };
    else if (cmp(from, to) && this.atomIndex() === null) ({ doc, pos } = ops.deleteRange(doc, from, to));
    if (isAtom(doc.blocks[pos.b])) pos = { b: pos.b, o: 0 };
    const r = ops.insertAtom(doc, pos, clean);
    if (clean.type === "table") this.commit(r.doc, caret(r.pos), "other", { ref: { b: r.pos.b, r: 0, c: 0 }, sel: caret({ b: 0, o: 0 }) });
    else if (clean.type === "hr") this.commit(r.doc, caret({ b: r.pos.b + 1, o: 0 }), "other");
    else this.commit(r.doc, this.atomSel(r.pos.b), "other");
    this.focus();
  }
  insertRule() { this.insertAtom({ type: "hr", spans: [] }); }
  insertTable(rows: number, cols: number, head = true) { this.insertAtom(tables.newTable(rows, cols, head)); }

  /** Change the selected atom (or the one at `b`). */
  updateAtom(patch: Partial<Block>, b: number | null = this.atomIndex()) {
    if (b === null || !isAtom(this.doc.blocks[b])) return;
    if (patch.width !== undefined) patch = { ...patch, width: patch.width >= 100 ? undefined : clampWidth(patch.width) };
    this.commit(ops.updateBlock(this.doc, b, patch), this.atomSel(b), "other");
  }
  removeAtom(b: number | null = this.atomIndex()) {
    if (b === null) return;
    const r = ops.removeBlock(this.doc, b);
    const pos = isAtom(r.doc.blocks[r.pos.b]) ? r.pos : { b: r.pos.b, o: 0 };
    this.commit(r.doc, caret(pos), "other");
    this.focus();
  }
  moveAtom(delta: -1 | 1, b: number | null = this.atomIndex()) {
    if (b === null) return;
    const r = ops.moveBlock(this.doc, b, delta);
    this.commit(r.doc, this.atomSel(r.pos.b), "other");
  }
  selectAtom(b: number) {
    if (!isAtom(this.doc.blocks[b])) return;
    this.cell = null;
    this.sel = this.atomSel(b);
    this.root.focus({ preventScroll: true });
    this.applySelection();
    this.notify();
  }

  // ── tables ───────────────────────────────────────────────────────────────
  /** The cell table commands act on: the caret's cell, or the last cell of a selected table. */
  private tableRef(): CellRef | null {
    if (this.cell) return this.cell.ref;
    const atom = this.atomIndex();
    const t = atom !== null ? this.doc.blocks[atom] : null;
    if (t?.type !== "table" || !t.rows) return null;
    return { b: atom!, r: t.rows.length - 1, c: t.rows[0].length - 1 };
  }
  private tableEdit(fn: (d: RichDoc, ref: CellRef) => RichDoc | ops.Result, move: (ref: CellRef) => CellRef = (r) => r) {
    const ref = this.tableRef();
    if (!ref) return;
    const out = fn(this.doc, ref);
    if ("pos" in out) { this.commit(out.doc, caret(out.pos), "other"); this.focus(); return; }
    const next = move(ref);
    if (cellAt(out, next)) this.commit(out, caret({ b: ref.b, o: 0 }), "other", { ref: next, sel: caret({ b: 0, o: 0 }) });
    else this.commit(out, this.atomSel(ref.b), "other");
    this.focus();
  }
  addRow(where: 0 | 1) { this.tableEdit((d, r) => tables.insertRow(d, r.b, r.r, where), (r) => ({ ...r, r: r.r + where })); }
  addCol(where: 0 | 1) { this.tableEdit((d, r) => tables.insertCol(d, r.b, r.c, where), (r) => ({ ...r, c: r.c + where })); }
  deleteRow() { this.tableEdit((d, r) => tables.deleteRow(d, r.b, r.r), (r) => ({ ...r, r: Math.max(0, r.r - 1) })); }
  deleteCol() { this.tableEdit((d, r) => tables.deleteCol(d, r.b, r.c), (r) => ({ ...r, c: Math.max(0, r.c - 1) })); }
  toggleHeader() { this.tableEdit((d, r) => tables.toggleHead(d, r.b)); }
  deleteTable() { this.tableEdit((d, r) => tables.deleteTable(d, r.b)); }
  private moveToCell(ref: CellRef, atEnd = false) {
    const len = blockLength(cellDoc(cellAt(this.doc, ref)).blocks[0]);
    this.cell = { ref, sel: caret({ b: 0, o: atEnd ? len : 0 }) };
    this.sel = caret({ b: ref.b, o: 0 });
    this.stored = null;
    this.applySelection();
    this.notify();
  }

  /** Link the selection (or the link around the caret); a bare caret with an address inserts the address. Empty removes. */
  setLink(href: string | undefined, text?: string) {
    const { doc, sel } = this.view();
    let [from, to] = ordered(sel);
    if (!cmp(from, to)) {
      const lr = ops.linkRange(doc, from);
      if (lr && !text) [from, to] = lr;
      else if (href) {
        const r = ops.insertText(doc, from, text || href, { ...ops.marksAt(doc, from), link: href });
        this.put(r.doc, caret(r.pos), "other");
        this.focus();
        return;
      } else return void this.focus();
    }
    this.put(ops.setMark(doc, from, to, "link", href), sel, "other");
    this.focus();
  }

  /** Copy the formats at the selection; the next selection made gets them (or `applyFormat` at once). */
  copyFormat() {
    const { doc, sel } = this.view();
    const [from, to] = ordered(sel);
    const b = doc.blocks[from.b];
    const m = marksOf(cmp(from, to) ? ops.activeIn(doc, from, to, null).marks : ops.marksAt(doc, from));
    delete m.link;
    const size = ops.activeIn(doc, from, to, null).size;
    if (size && size !== BLOCK_SIZE[b.type]) m.size = size;
    this.painter = { marks: m, block: { type: isAtom(b) ? "p" : b.type, align: b.align, list: b.list, indent: b.indent } };
    this.notify();
  }
  cancelFormat() { if (this.painter) { this.painter = null; this.notify(); } }
  applyFormat() {
    const p = this.painter;
    const { doc: d, sel } = this.view();
    const [from, to] = ordered(sel);
    if (!p || !cmp(from, to)) return;
    let doc = ops.paintMarks(d, from, to, p.marks);
    if (!this.cell && (from.b !== to.b || p.block.type !== "p" || p.block.list || p.block.align)) {
      doc = ops.mapBlocks(doc, from, to, (b) => ({ ...b, type: p.block.type, align: p.block.align, list: p.block.list, indent: p.block.indent }));
    }
    this.painter = null;
    this.put(doc, sel, "other");
  }

  /** Insert text at the caret (replacing the selection). */
  insertText(text: string) { this.focus(); this.typeText(text.replace(/\r\n?/g, "\n")); }
  /** Insert HTML at the caret, read into the model (and the schema) like a paste. */
  insertHTML(html: string) { this.insertFragment(parseHtml(html, this.opts.schema)); }
  insertBlocks(blocks: Block[]) { this.insertFragment(blocks.map((b) => cleanBlock(b, this.opts.schema)).filter((b): b is Block => !!b)); }

  // ── find & replace ───────────────────────────────────────────────────────
  private findQuery: { q: string; cs: boolean } | null = null;
  /** Mark every match (CSS Custom Highlights where the browser has them) and return how many there are. */
  find(query: string, caseSensitive = false): number {
    this.findQuery = query ? { q: query, cs: caseSensitive } : null;
    const hits = ops.findAll(this.doc, query, caseSensitive);
    if (hasHighlights()) {
      const ranges = hits.map(([a, z]) => {
        const r = document.createRange();
        const s = domFromPos(this.root, a);
        const e = domFromPos(this.root, z);
        if (!s || !e) return null;
        r.setStart(s[0], s[1]);
        r.setEnd(e[0], e[1]);
        return r;
      }).filter((r): r is Range => !!r);
      const H = (globalThis as unknown as { Highlight: new (...r: Range[]) => unknown }).Highlight;
      (CSS as unknown as { highlights: Map<string, unknown> }).highlights.set("se-find", new H(...ranges));
    }
    return hits.length;
  }
  clearFind() {
    this.findQuery = null;
    if (hasHighlights()) (CSS as unknown as { highlights: Map<string, unknown> }).highlights.delete("se-find");
  }
  /** Select the next (or previous) match after the caret; returns its number (1-based) and the total. */
  findNext(query: string, caseSensitive = false, back = false): { index: number; total: number } {
    const hits = ops.findAll(this.doc, query, caseSensitive);
    if (!hits.length) return { index: 0, total: 0 };
    const [from, to] = ordered(this.sel);
    let i = back ? hits.findLastIndex(([a]) => cmp(a, from) < 0) : hits.findIndex(([a]) => cmp(a, from) > 0 || (cmp(a, from) === 0 && cmp(from, to) === 0));
    if (i < 0) i = back ? hits.length - 1 : 0;
    this.cell = null;
    this.sel = { anchor: hits[i][0], focus: hits[i][1] };
    this.applySelection();
    (domFromPos(this.root, hits[i][0])?.[0].parentElement)?.scrollIntoView({ block: "nearest" });
    this.notify();
    return { index: i + 1, total: hits.length };
  }
  /** Replace the selected match (if the selection is one) and move on. */
  replaceNext(query: string, replacement: string, caseSensitive = false) {
    const [from, to] = ordered(this.sel);
    const hit = ops.findAll(this.doc, query, caseSensitive).find(([a, z]) => !cmp(a, from) && !cmp(z, to));
    if (hit) {
      const marks = ops.marksAt(this.doc, { b: from.b, o: from.o + 1 });
      const cut = ops.deleteRange(this.doc, from, to);
      const r = ops.insertText(cut.doc, cut.pos, replacement, marks);
      this.commit(r.doc, caret(r.pos), "other");
    }
    const n = this.findNext(query, caseSensitive);
    if (this.findQuery) this.find(this.findQuery.q, this.findQuery.cs);
    return n;
  }
  replaceAll(query: string, replacement: string, caseSensitive = false): number {
    const { doc, count } = ops.replaceAll(this.doc, query, replacement, caseSensitive);
    if (count) this.commit(doc, caret(ops.clampPos(doc, this.sel.focus)), "other");
    if (this.findQuery) this.find(this.findQuery.q, this.findQuery.cs);
    return count;
  }

  // ── browser events ───────────────────────────────────────────────────────
  private onBeforeInput(e: InputEvent) {
    if (this.readOnly) { e.preventDefault(); return; }
    if (e.isComposing || this.composing || e.inputType === "insertCompositionText") return;   // the input method's turn
    this.catchUp();
    const t = e.inputType;
    if (t === "insertText" || t === "insertReplacementText") {
      e.preventDefault();
      const text = e.data ?? e.dataTransfer?.getData("text/plain") ?? "";
      const target = t === "insertReplacementText" ? e.getTargetRanges?.()[0] : undefined;
      if (target) {
        const a = this.viewPos(target.startContainer, target.startOffset);
        const z = this.viewPos(target.endContainer, target.endOffset);
        if (a && z) { if (this.cell) this.cell = { ...this.cell, sel: { anchor: a, focus: z } }; else this.sel = { anchor: a, focus: z }; }
      }
      if (text) this.typeText(text.replace(/\r\n?/g, "\n"));
      return;
    }
    if (t === "insertParagraph") { e.preventDefault(); this.enter(); return; }
    if (t === "insertLineBreak") { e.preventDefault(); this.typeText("\n"); return; }
    if (t.startsWith("delete")) {
      if (t === "deleteByDrag") { e.preventDefault(); return; }               // the drop handles a move
      e.preventDefault(); this.deleteFor(t, e); return;
    }
    if (t === "historyUndo") { e.preventDefault(); this.undo(); return; }
    if (t === "historyRedo") { e.preventDefault(); this.redo(); return; }
    const fmt: Record<string, Toggle> = { formatBold: "bold", formatItalic: "italic", formatUnderline: "underline", formatStrikeThrough: "strike" };
    if (fmt[t]) { e.preventDefault(); if (this.opts.schema.has(fmt[t])) this.toggle(fmt[t]); return; }
    e.preventDefault();       // paste / drop arrive as their own events; anything else would edit the DOM behind the model
  }

  /** The browser changed the DOM itself (an input method, autocorrect): read the changed blocks back. */
  private onInput() {
    if (this.composing) return;
    this.syncFromDom();
  }
  private syncFromDom() {
    if (this.cell) {
      const td = cellElement(this.root, this.cell.ref);
      const cell = cellAt(this.doc, this.cell.ref);
      if (!td || !cell) return;
      const orphan = this.stored ?? ops.marksAt(cellDoc(cell), ordered(this.cell.sel)[0]);
      const spans = normaliseSpans(readSpans(td, orphan));
      if (spans.map((s) => s.text).join("") === cell.spans.map((s) => s.text).join("")) return;
      const fresh = this.readSelection(tables.mapCell(this.doc, this.cell.ref, (c) => ({ ...c, spans })));
      this.stored = null;
      this.commit(tables.mapCell(this.doc, this.cell.ref, (c) => ({ ...c, spans })), this.sel, "type", fresh?.cell ?? this.cell);
      return;
    }
    const kids = Array.from(this.root.children) as HTMLElement[];
    const orphan = this.stored ?? ops.marksAt(this.doc, ordered(this.sel)[0]);
    let blocks: Block[];
    const sameShape = kids.length === this.doc.blocks.length && kids.every((k, i) => this.cache.get(this.doc.blocks[i]) === k);
    if (sameShape) {
      blocks = this.doc.blocks.map((b, i) => (isAtom(b) || shownText(kids[i]) === modelText(b) ? b : readBlock(kids[i], b, orphan)));
    } else {
      const known = new Map<Element, Block>();
      this.doc.blocks.forEach((b) => { const el = this.cache.get(b); if (el) known.set(el, b); });
      blocks = kids.map((k) => {
        const b = known.get(k);
        return b && isAtom(b) ? b : readBlock(k, b ?? { type: "p", spans: [] }, orphan);
      });
    }
    if (blocks.every((b, i) => b === this.doc.blocks[i]) && blocks.length === this.doc.blocks.length) return;
    const doc: RichDoc = { version: 1, blocks: blocks.map((b, i) => (isAtom(b) || b === this.doc.blocks[i] ? b : { ...b, spans: normaliseSpans(b.spans) })) };
    const next = doc.blocks.length ? doc : emptyDoc();
    const sel = this.readSelection(next)?.sel ?? this.sel;          // the caret where the browser left it, in the new text
    this.stored = null;
    this.commit(next, { anchor: ops.clampPos(next, sel.anchor), focus: ops.clampPos(next, sel.focus) }, "type");
  }
  private onCompositionStart() {
    this.catchUp();
    const { doc, sel } = this.view();
    const [from, to] = ordered(sel);
    if (cmp(from, to)) {                     // the composed text replaces the selection: take it out of the model first
      const r = ops.deleteRange(doc, from, to);
      this.put(r.doc, caret(r.pos), "delete");
    }
    this.composing = true;
  }
  private onCompositionEnd() {
    this.composing = false;
    this.syncFromDom();
  }

  private onKeyDown(e: KeyboardEvent) {
    if (e.isComposing || this.composing) return;
    this.catchUp();
    const mod = e.ctrlKey || e.metaKey;
    const code = e.code;
    const act = (fn: () => void) => { e.preventDefault(); fn(); };
    if (e.key === "Escape" && this.painter) return act(() => this.cancelFormat());
    const s = this.opts.schema;

    // A selected atom: Enter / arrows step off it, Delete removes it.
    const atom = this.cell ? null : this.atomIndex();
    if (atom !== null && !mod && !this.readOnly) {
      if (e.key === "Enter" || e.key === "ArrowDown" || e.key === "ArrowRight") return act(() => this.caretAfter(atom));
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") return act(() => this.caretBefore(atom));
      if (e.key === "Backspace" || e.key === "Delete") return act(() => this.removeAtom(atom));
      if (e.key === "Tab" && this.doc.blocks[atom].type === "table") return act(() => this.moveToCell({ b: atom, r: 0, c: 0 }));
    }

    // In a cell: Tab walks the cells (a new row past the last), arrows leave at the edges.
    if (this.cell && !mod && !e.altKey) {
      const { ref, sel } = this.cell;
      const len = blockLength(cellDoc(cellAt(this.doc, ref)).blocks[0]);
      const [from, to] = ordered(sel);
      if (e.key === "Tab") {
        return act(() => {
          const next = tables.stepCell(this.doc, ref, e.shiftKey ? -1 : 1);
          if (next) this.moveToCell(next);
          else if (!e.shiftKey) { this.addRow(1); this.moveToCell({ b: ref.b, r: ref.r + 1, c: 0 }); }
        });
      }
      const rows = this.doc.blocks[ref.b].rows!;
      if (e.key === "ArrowUp" && !e.shiftKey && !cmp(from, to) && !this.lineAbove()) {
        return act(() => (ref.r > 0 ? this.moveToCell({ ...ref, r: ref.r - 1 }) : this.caretBefore(ref.b)));
      }
      if (e.key === "ArrowDown" && !e.shiftKey && !cmp(from, to) && !this.lineBelow()) {
        return act(() => (ref.r < rows.length - 1 ? this.moveToCell({ ...ref, r: ref.r + 1 }) : this.caretAfter(ref.b)));
      }
      if (e.key === "ArrowLeft" && !e.shiftKey && from.o === 0 && !cmp(from, to)) {
        const prev = tables.stepCell(this.doc, ref, -1);
        return act(() => (prev ? this.moveToCell(prev, true) : this.caretBefore(ref.b)));
      }
      if (e.key === "ArrowRight" && !e.shiftKey && to.o >= len && !cmp(from, to)) {
        const next = tables.stepCell(this.doc, ref, 1);
        return act(() => (next ? this.moveToCell(next) : this.caretAfter(ref.b)));
      }
    }

    if (e.key === "Tab" && !mod && !e.altKey && !this.cell) {
      const [from, to] = ordered(this.sel);
      if (this.doc.blocks.slice(from.b, to.b + 1).some((b) => b.list) && s.has("indent")) return act(() => this.indent(e.shiftKey ? -1 : 1));
      if (this.doc.blocks[from.b]?.type === "code") return act(() => this.typeText("  "));
      return;                                  // elsewhere Tab moves focus on, as everywhere else
    }
    if (!mod) return;
    if (e.altKey) {
      if (code === "KeyC") return act(() => this.copyFormat());
      if (code === "KeyV") return act(() => this.applyFormat());
      const heading: Record<string, TextType> = { Digit0: "p", Digit1: "h1", Digit2: "h2", Digit3: "h3", Digit4: "h4" };
      if (heading[code] && s.has(heading[code])) return act(() => this.setBlock(heading[code]));
      return;
    }
    if (e.shiftKey) {
      if (code === "KeyV") { this.plainPaste = true; return; }
      if (code === "KeyZ") return act(() => this.redo());
      if (code === "KeyX" && s.has("strike")) return act(() => this.toggle("strike"));
      if (code === "Digit7" && s.has("ordered")) return act(() => this.toggleList("ordered"));
      if (code === "Digit8" && s.has("bullet")) return act(() => this.toggleList("bullet"));
      if (code === "Digit9" && s.has("check")) return act(() => this.toggleList("check"));
      if (code === "Period" && s.has("size")) return act(() => this.stepSize(1));
      if (code === "Comma" && s.has("size")) return act(() => this.stepSize(-1));
      const align: Record<string, Align> = { KeyL: "left", KeyE: "center", KeyR: "right", KeyJ: "justify" };
      if (align[code] && s.has("align")) return act(() => this.setAlign(align[code]));
      return;
    }
    if (code === "KeyB" && s.has("bold")) return act(() => this.toggle("bold"));
    if (code === "KeyI" && s.has("italic")) return act(() => this.toggle("italic"));
    if (code === "KeyU" && s.has("underline")) return act(() => this.toggle("underline"));
    if (code === "KeyE" && s.has("code")) return act(() => this.toggle("code"));
    if (code === "KeyZ") return act(() => this.undo());
    if (code === "KeyY") return act(() => this.redo());
    if (code === "Backslash") return act(() => this.clearFormatting());
    if (code === "Period" && s.has("script")) return act(() => this.setScript("sup"));
    if (code === "Comma" && s.has("script")) return act(() => this.setScript("sub"));
  }
  /** Whether the caret's cell has a line above / below the caret (so Up / Down move within it). */
  private lineAbove() { return this.caretLine() === "middle" || this.caretLine() === "last"; }
  private lineBelow() { return this.caretLine() === "middle" || this.caretLine() === "first"; }
  private caretLine(): "only" | "first" | "middle" | "last" {
    const td = this.cell && cellElement(this.root, this.cell.ref);
    const s = window.getSelection();
    if (!td || !s?.rangeCount) return "only";
    const r = s.getRangeAt(0).getClientRects()[0] ?? s.getRangeAt(0).getBoundingClientRect();
    const box = td.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(td).paddingTop) || 0;
    const lh = parseFloat(getComputedStyle(td).lineHeight) || 20;
    const top = r.top - box.top - pad < lh * 0.6;
    const bottom = box.bottom - pad - r.bottom < lh * 0.6;
    return top && bottom ? "only" : top ? "first" : bottom ? "last" : "middle";
  }

  private onPaste(e: ClipboardEvent) {
    e.preventDefault();
    if (this.readOnly) return;
    this.catchUp();
    const plain = this.plainPaste;
    this.plainPaste = false;
    const data = e.clipboardData;
    if (!data) return;
    const files = Array.from(data.files ?? []);
    const text = data.getData("text/plain");
    const html = data.getData("text/html");
    if (files.length && this.opts.onFiles && !text && !/<img|<table/i.test(html)) {
      this.opts.onFiles(files, this.cell ? this.doc.blocks[this.cell.ref.b] : null);
      return;
    }
    const schema = this.opts.schema;
    let exact: Block[] | null = null;
    if (!plain) {
      try { const raw = data.getData(MIME); if (raw) exact = (JSON.parse(raw) as unknown[]).map((b) => cleanBlock(b, schema)).filter((b): b is Block => !!b); } catch { /* not ours */ }
      if (!exact && lastCopy && lastCopy.plain === text) exact = lastCopy.blocks.map((b) => cleanBlock(b, schema)).filter((b): b is Block => !!b);
    }
    const blocks = exact ?? (!plain && html ? parseHtml(html, schema) : plainToBlocks(text));
    if (!blocks.length && text) return this.insertFragment(plainToBlocks(text));
    this.insertFragment(blocks);
  }
  private onCopy(e: ClipboardEvent | DragEvent, cut: boolean) {
    this.catchUp();
    const { doc, sel } = this.view();
    const [from, to] = ordered(sel);
    if (!cmp(from, to)) return;
    const frag = ops.fragment(doc, from, to);
    const data = (e as ClipboardEvent).clipboardData ?? (e as DragEvent).dataTransfer;
    if (!data) return;
    const plain = frag.length === 1 && !isAtom(frag[0]) ? frag[0].spans.map((x) => x.text).join("") : docToPlain({ version: 1, blocks: frag });
    data.setData("text/plain", plain);
    data.setData("text/html", clipboardHtml(frag));
    try { data.setData(MIME, JSON.stringify(frag)); } catch { /* a browser that only takes standard types */ }
    lastCopy = { plain, blocks: frag };
    if (e.type === "dragstart") return;
    e.preventDefault();
    if (cut && !this.readOnly) { const r = ops.deleteRange(doc, from, to); this.put(r.doc, caret(r.pos), "other"); }
  }
  private onDragStart(e: DragEvent) {
    if ((e.target as HTMLElement).closest?.("[data-resize]")) { e.preventDefault(); return; }
    this.dragging = true;
    this.onCopy(e, false);
  }
  private dropPos(e: DragEvent): Pos | null {
    const docAny = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
    const hit = docAny.caretPositionFromPoint?.(e.clientX, e.clientY);
    const range = hit ? null : document.caretRangeFromPoint?.(e.clientX, e.clientY);
    const node = hit ? hit.offsetNode : range?.startContainer;
    if (node && cellOf(this.root, node)) return null;                    // not into a cell
    return hit ? posFromDom(this.root, hit.offsetNode, hit.offset) : range ? posFromDom(this.root, range.startContainer, range.startOffset) : null;
  }
  private onDrop(e: DragEvent) {
    e.preventDefault();
    if (this.readOnly || !e.dataTransfer) return;
    let at = this.dropPos(e);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length && this.opts.onFiles) {
      this.opts.onFiles(files, at ? this.doc.blocks[at.b] : null);
      return;
    }
    if (!at) return;
    const html = e.dataTransfer.getData("text/html");
    const schema = this.opts.schema;
    const internal = this.dragging && !this.cell;
    const blocks = internal ? ops.fragment(this.doc, ...ordered(this.sel))          // moved within: the exact formats
      : html ? parseHtml(html, schema) : plainToBlocks(e.dataTransfer.getData("text/plain"));
    let doc = this.doc;
    if (internal) {                                   // moved within the editor: take it from where it was
      const [from, to] = ordered(this.sel);
      if (cmp(at, from) >= 0 && cmp(at, to) <= 0) return;
      doc = ops.deleteRange(doc, from, to).doc;
      if (cmp(at, to) > 0) at = at.b === to.b ? { b: from.b, o: from.o + (at.o - to.o) } : { b: at.b - (to.b - from.b), o: at.o };
    }
    this.dragging = false;
    this.cell = null;
    const r = ops.insertBlocks(doc, ops.clampPos(doc, at), blocks);
    this.commit(r.doc, caret(r.pos), "other");
  }

  private onMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    const blockEl = Array.from(this.root.children).find((k) => k.contains(target)) as HTMLElement | undefined;
    if (!blockEl) return;
    const b = Array.prototype.indexOf.call(this.root.children, blockEl);
    const blk = this.doc.blocks[b];
    if (!blk) return;
    // The checkbox of a checklist item — the marker drawn in the item's left gutter.
    if (blk.list === "check" && !this.readOnly) {
      const box = blockEl.getBoundingClientRect();
      const gutter = parseFloat(getComputedStyle(blockEl).paddingLeft) || 0;
      if (e.clientX < box.left + gutter && e.clientX > box.left + gutter - 26) { e.preventDefault(); this.toggleChecked(b); return; }
    }
    if (!isAtom(blk) || target.closest("td,th")) return;
    if (target.closest("[data-resize]") && !this.readOnly) { e.preventDefault(); this.startResize(e, b, blockEl); return; }
    if (target.tagName === "VIDEO") { this.selectAtom(b); return; }      // the controls still work
    if (target.closest("a") && !(e.ctrlKey || e.metaKey)) e.preventDefault();
    e.preventDefault();
    this.selectAtom(b);
  }
  /** Drag the corner of an image or video to set its width (percent of the content width). */
  private startResize(e: MouseEvent, b: number, el: HTMLElement) {
    const fig = el.querySelector(".se-figure") as HTMLElement | null;
    if (!fig) return;
    this.selectAtom(b);
    this.resizing = true;
    const box = el.getBoundingClientRect();
    const align = this.doc.blocks[b].align ?? "center";
    let pct = this.doc.blocks[b].width ?? 100;
    const move = (ev: PointerEvent) => {
      // Media sits centred unless aligned: a centred one grows both ways, so its width is twice the pointer's reach.
      const px = align === "right" ? box.right - ev.clientX
        : align === "left" || align === "justify" ? ev.clientX - box.left
        : Math.abs(ev.clientX - (box.left + box.width / 2)) * 2;
      pct = clampWidth((px / box.width) * 100);
      fig.style.width = `${pct}%`;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      this.resizing = false;
      this.updateAtom({ width: pct }, b);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  private onMouseUp() {
    if (!this.painter) return;
    setTimeout(() => {
      this.catchUp();
      const { sel } = this.view();
      if (!isCollapsed(sel)) this.applyFormat();
    }, 0);
  }
  private onClick(e: MouseEvent) {
    const a = (e.target as HTMLElement).closest?.("a[href]") as HTMLAnchorElement | null;
    if (a && (e.ctrlKey || e.metaKey || this.readOnly)) { e.preventDefault(); window.open(a.href, "_blank", "noopener,noreferrer"); }
    else if (a) e.preventDefault();
  }
}

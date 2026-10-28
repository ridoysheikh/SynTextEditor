/**
 * Editing as pure functions: (document, selection) in → new document and caret out. Blocks that don't change
 * keep their identity, so the editor redraws only what changed. No DOM here.
 */
import {
  BLOCK_SIZE, blockLength, blockText, clampSize, emptyBlock, isAtom, MAX_INDENT, marksOf, normaliseSpans, spansLength,
  type Align, type Block, type ListKind, type MarkKey, type Marks, type RichDoc, type Span, type TextType, type Toggle,
} from "./model";

export interface Pos { b: number; o: number }
export interface Sel { anchor: Pos; focus: Pos }
export interface Result { doc: RichDoc; pos: Pos }

export const cmp = (a: Pos, b: Pos) => a.b - b.b || a.o - b.o;
export const caret = (p: Pos): Sel => ({ anchor: p, focus: p });
export const isCollapsed = (s: Sel) => cmp(s.anchor, s.focus) === 0;
export const ordered = (s: Sel): [Pos, Pos] => (cmp(s.anchor, s.focus) <= 0 ? [s.anchor, s.focus] : [s.focus, s.anchor]);
export const docEnd = (d: RichDoc): Pos => ({ b: d.blocks.length - 1, o: blockLength(d.blocks[d.blocks.length - 1]) });
export const clampPos = (d: RichDoc, p: Pos): Pos => {
  const b = Math.max(0, Math.min(d.blocks.length - 1, p.b));
  return { b, o: Math.max(0, Math.min(blockLength(d.blocks[b]), p.o)) };
};
export const withBlocks = (d: RichDoc, blocks: Block[]): RichDoc => ({ version: 1, blocks: blocks.length ? blocks : [emptyBlock()] });

/** Spans before and after a character offset. */
export function splitSpans(spans: Span[], o: number): [Span[], Span[]] {
  const left: Span[] = [];
  const right: Span[] = [];
  let at = 0;
  for (const s of spans) {
    const end = at + s.text.length;
    if (end <= o) left.push(s);
    else if (at >= o) right.push(s);
    else {
      left.push({ ...s, text: s.text.slice(0, o - at) });
      right.push({ ...s, text: s.text.slice(o - at) });
    }
    at = end;
  }
  return [left, right];
}
export const sliceSpans = (spans: Span[], a: number, z: number) => splitSpans(splitSpans(spans, z)[0], a)[1];

/** The formats at a caret: the character before it (a link doesn't carry past its end), or after it at a block's start. */
export function marksAt(d: RichDoc, p: Pos): Marks {
  const b = d.blocks[p.b];
  if (!b || isAtom(b) || !b.spans.length) return {};
  if (p.o === 0) {
    const { link: _l, ...m } = marksOf(b.spans[0]);
    return m;
  }
  let at = 0;
  for (const s of b.spans) {
    at += s.text.length;
    if (at >= p.o) {
      const m = marksOf(s);
      if (m.link && at === p.o) delete m.link;
      return m;
    }
  }
  return {};
}

export function deleteRange(d: RichDoc, from: Pos, to: Pos): Result {
  if (cmp(from, to) >= 0) return { doc: d, pos: from };
  const blocks = d.blocks.slice();
  const A = blocks[from.b];
  const B = blocks[to.b];
  if (from.b === to.b) {
    blocks[from.b] = { ...A, spans: normaliseSpans([...sliceSpans(A.spans, 0, from.o), ...sliceSpans(A.spans, to.o, blockLength(A))]) };
    return { doc: withBlocks(d, blocks), pos: from };
  }
  const tail = isAtom(B) ? [] : sliceSpans(B.spans, to.o, blockLength(B));
  const merged: Block = isAtom(A)
    ? (isAtom(B) ? emptyBlock() : { ...B, spans: tail })
    : { ...A, spans: normaliseSpans([...sliceSpans(A.spans, 0, from.o), ...tail]) };
  blocks.splice(from.b, to.b - from.b + 1, merged);
  return { doc: withBlocks(d, blocks), pos: isAtom(A) ? { b: from.b, o: 0 } : from };
}

/** Text in one block (a "\n" is a line break inside it), with these formats. */
export function insertText(d: RichDoc, p: Pos, text: string, marks: Marks): Result {
  if (!text) return { doc: d, pos: p };
  return insertSpans(d, p, [{ ...marks, text }]);
}

export function insertSpans(d: RichDoc, p: Pos, spans: Span[]): Result {
  const blocks = d.blocks.slice();
  let pos = p;
  if (isAtom(blocks[pos.b])) {                       // typing on an atom: a paragraph after it
    blocks.splice(pos.b + 1, 0, emptyBlock());
    pos = { b: pos.b + 1, o: 0 };
  }
  const blk = blocks[pos.b];
  const [l, r] = splitSpans(blk.spans, pos.o);
  blocks[pos.b] = { ...blk, spans: normaliseSpans([...l, ...spans, ...r]) };
  return { doc: withBlocks(d, blocks), pos: { b: pos.b, o: pos.o + spansLength(spans) } };
}

/** Enter. A heading ends into a paragraph; Enter on an empty list item ends the list; a new checklist item starts unticked. */
export function splitBlock(d: RichDoc, p: Pos): Result {
  const blocks = d.blocks.slice();
  const blk = blocks[p.b];
  if (isAtom(blk)) {
    blocks.splice(p.b + 1, 0, emptyBlock());
    return { doc: withBlocks(d, blocks), pos: { b: p.b + 1, o: 0 } };
  }
  if (blk.list && blockLength(blk) === 0) {
    blocks[p.b] = blk.indent ? { ...blk, indent: blk.indent - 1 || undefined } : { type: "p", ...(blk.align ? { align: blk.align } : {}), spans: [] };
    return { doc: withBlocks(d, blocks), pos: p };
  }
  const [l, r] = splitSpans(blk.spans, p.o);
  const next: Block = { ...blk, spans: r };
  delete next.checked;
  if (blk.type !== "p" && blk.type !== "quote" && r.length === 0) next.type = "p";
  blocks.splice(p.b, 1, { ...blk, spans: l }, next);
  return { doc: withBlocks(d, blocks), pos: { b: p.b + 1, o: 0 } };
}

/** Backspace at the start of a block: a list item steps out first, a quote turns plain, otherwise join the one above. */
export function joinBackward(d: RichDoc, p: Pos): Result {
  const blk = d.blocks[p.b];
  const blocks = d.blocks.slice();
  if (blk.list) {
    blocks[p.b] = blk.indent ? { ...blk, indent: blk.indent - 1 || undefined } : { ...blk, list: undefined, indent: undefined, checked: undefined };
    return { doc: withBlocks(d, blocks), pos: p };
  }
  if (blk.type === "quote" || blk.type === "code" || (blk.type !== "p" && !isAtom(blk) && blockLength(blk) === 0)) {
    blocks[p.b] = { ...blk, type: "p" };
    return { doc: withBlocks(d, blocks), pos: p };
  }
  if (p.b === 0) return { doc: d, pos: p };
  const prev = blocks[p.b - 1];
  if (isAtom(prev)) {
    if (blockLength(blk) === 0) {                    // an empty line under an atom goes; the caret lands before it
      blocks.splice(p.b, 1);
      return { doc: withBlocks(d, blocks), pos: { b: p.b - 1, o: 0 } };
    }
    return { doc: d, pos: { b: p.b - 1, o: 0 } };     // otherwise step onto the atom (the editor selects it)
  }
  if (blockLength(prev) === 0 && blk.type !== "p") {  // an empty line above a heading goes, the heading stays
    blocks.splice(p.b - 1, 1);
    return { doc: withBlocks(d, blocks), pos: { b: p.b - 1, o: 0 } };
  }
  return deleteRange(d, { b: p.b - 1, o: blockLength(prev) }, { b: p.b, o: 0 });
}

/** Delete at the end of a block: join the one below (an atom below is stepped onto, not swallowed). */
export function joinForward(d: RichDoc, p: Pos): Result {
  if (p.b >= d.blocks.length - 1) return { doc: d, pos: p };
  if (isAtom(d.blocks[p.b + 1])) {
    if (blockLength(d.blocks[p.b]) === 0 && !isAtom(d.blocks[p.b])) {
      const blocks = d.blocks.slice();
      blocks.splice(p.b, 1);
      return { doc: withBlocks(d, blocks), pos: { b: p.b, o: 0 } };
    }
    return { doc: d, pos: { b: p.b + 1, o: 0 } };
  }
  return deleteRange(d, p, { b: p.b + 1, o: 0 });
}

/** Blocks copied out of a range (the first and last cut to the selection). */
export function fragment(d: RichDoc, from: Pos, to: Pos): Block[] {
  if (cmp(from, to) >= 0) return [];
  return d.blocks.slice(from.b, to.b + 1).map((b, i, all) => {
    if (isAtom(b)) return b;
    const a = i === 0 ? from.o : 0;
    const z = i === all.length - 1 ? to.o : blockLength(b);
    return { ...b, spans: sliceSpans(b.spans, a, z) };
  });
}

/** Paste / drop: one block's worth goes inline; several split the block around them. */
export function insertBlocks(d: RichDoc, p: Pos, frag: Block[]): Result {
  const parts = frag.filter((b) => isAtom(b) || b.spans.length || frag.length > 1);
  if (!parts.length) return { doc: d, pos: p };
  const cur = d.blocks[p.b];
  if (parts.length === 1 && !isAtom(parts[0])) {
    if (!isAtom(cur) && blockLength(cur) === 0) {                // an empty line takes the pasted block's kind
      const blocks = d.blocks.slice();
      blocks[p.b] = { ...parts[0], spans: normaliseSpans(parts[0].spans) };
      return { doc: withBlocks(d, blocks), pos: { b: p.b, o: blockLength(blocks[p.b]) } };
    }
    return insertSpans(d, p, parts[0].spans);
  }
  const [l, r] = isAtom(cur) ? [[], []] : splitSpans(cur.spans, p.o);
  const out: Block[] = [];
  const first = parts[0];
  if (isAtom(cur)) out.push(cur);
  if (!isAtom(cur) && l.length) {
    if (isAtom(first)) out.push({ ...cur, spans: l }, first);
    else out.push({ ...cur, spans: normaliseSpans([...l, ...first.spans]) });
  } else out.push(first);
  out.push(...parts.slice(1));
  const last = out[out.length - 1];
  let pos: Pos;
  if (isAtom(last)) {
    out.push({ ...(isAtom(cur) ? emptyBlock() : cur), spans: r });
    pos = { b: p.b + out.length - 1, o: 0 };
  } else {
    const at = blockLength(last);
    out[out.length - 1] = { ...last, spans: normaliseSpans([...last.spans, ...r]) };
    pos = { b: p.b + out.length - 1, o: at };
  }
  const blocks = d.blocks.slice();
  blocks.splice(p.b, 1, ...out);
  return { doc: withBlocks(d, blocks), pos };
}

/** Change every span in a range (split at its edges). */
export function mapSpans(d: RichDoc, from: Pos, to: Pos, fn: (s: Span, b: Block) => Span): RichDoc {
  if (cmp(from, to) >= 0) return d;
  const blocks = d.blocks.slice();
  for (let i = from.b; i <= to.b; i++) {
    const b = blocks[i];
    if (isAtom(b)) continue;
    const a = i === from.b ? from.o : 0;
    const z = i === to.b ? to.o : blockLength(b);
    if (a >= z) continue;
    const [l, rest] = splitSpans(b.spans, a);
    const [mid, r] = splitSpans(rest, z - a);
    blocks[i] = { ...b, spans: normaliseSpans([...l, ...mid.map((s) => fn(s, b)), ...r]) };
  }
  return withBlocks(d, blocks);
}

export interface Active {
  /** formats every character in the range shares */
  marks: Marks;
  /** px, null when mixed */
  size: number | null;
  block: TextType | null;
  align: Align | null;
  list: ListKind | null | "mixed";
}
/** What the toolbar shows for a range. */
export function activeIn(d: RichDoc, from: Pos, to: Pos, stored: Marks | null): Active {
  const blocks = d.blocks.slice(from.b, to.b + 1).filter((b) => !isAtom(b));
  const one = <T,>(vals: T[]) => (vals.every((v) => v === vals[0]) ? vals[0] : null);
  const block = (one(blocks.map((b) => b.type)) ?? null) as TextType | null;
  const align = one(blocks.map((b) => b.align ?? "left")) ?? null;
  const lists = blocks.map((b) => b.list ?? null);
  const list = lists.every((l) => l === lists[0]) ? lists[0] ?? null : "mixed";
  if (cmp(from, to) === 0) {
    const m = stored ?? marksAt(d, from);
    return { marks: m, size: m.size ?? BLOCK_SIZE[d.blocks[from.b]?.type ?? "p"], block, align, list };
  }
  const runs: { m: Marks; size: number }[] = [];
  mapSpans(d, from, to, (s, b) => { runs.push({ m: marksOf(s), size: s.size ?? BLOCK_SIZE[b.type] }); return s; });
  if (!runs.length) return { marks: {}, size: BLOCK_SIZE[block ?? "p"], block, align, list };
  const marks: Marks = {};
  for (const k of ["bold", "italic", "underline", "strike", "code", "script", "font", "color", "highlight", "link"] as const) {
    const v = one(runs.map((r) => r.m[k]));
    if (v !== undefined && v !== null) (marks as Record<string, unknown>)[k] = v;
  }
  return { marks, size: one(runs.map((r) => r.size)), block, align, list };
}

export function toggleMark(d: RichDoc, from: Pos, to: Pos, key: Toggle): RichDoc {
  const on = !activeIn(d, from, to, null).marks[key];
  return mapSpans(d, from, to, (s) => {
    const n = { ...s };
    if (on) n[key] = true; else delete n[key];
    return n;
  });
}
export function setMark<K extends MarkKey>(d: RichDoc, from: Pos, to: Pos, key: K, value: Marks[K] | undefined): RichDoc {
  return mapSpans(d, from, to, (s) => {
    const n = { ...s } as Span;
    if (value === undefined || value === null) delete n[key]; else (n as Marks)[key] = value;
    return n;
  });
}
/** Bigger / smaller by `delta` px from each run's own size (mixed sizes keep their differences). */
export function stepSize(d: RichDoc, from: Pos, to: Pos, delta: number): RichDoc {
  return mapSpans(d, from, to, (s, b) => {
    const size = clampSize((s.size ?? BLOCK_SIZE[b.type]) + delta);
    const n: Span = { ...s, size };
    if (size === BLOCK_SIZE[b.type]) delete n.size;
    return n;
  });
}
export function clearMarks(d: RichDoc, from: Pos, to: Pos): RichDoc {
  return mapSpans(d, from, to, (s) => ({ text: s.text }));
}
/** Replace a range's formats outright (the format painter). */
export function paintMarks(d: RichDoc, from: Pos, to: Pos, marks: Marks): RichDoc {
  return mapSpans(d, from, to, (s) => ({ ...marks, text: s.text }));
}

/** Change every text block the range touches. */
export function mapBlocks(d: RichDoc, from: Pos, to: Pos, fn: (b: Block) => Block): RichDoc {
  const blocks = d.blocks.slice();
  for (let i = from.b; i <= to.b; i++) if (!isAtom(blocks[i])) blocks[i] = fn(blocks[i]);
  return withBlocks(d, blocks);
}
export const setBlockType = (d: RichDoc, from: Pos, to: Pos, type: TextType) =>
  mapBlocks(d, from, to, (b) => ({ ...b, type, ...(type !== "p" ? { list: undefined, indent: undefined, checked: undefined } : {}) }));
export const setAlign = (d: RichDoc, from: Pos, to: Pos, align: Align) =>
  mapBlocks(d, from, to, (b) => ({ ...b, align: align === "left" ? undefined : align }));
export function toggleList(d: RichDoc, from: Pos, to: Pos, kind: ListKind): RichDoc {
  const off = d.blocks.slice(from.b, to.b + 1).filter((b) => !isAtom(b)).every((b) => b.list === kind);
  return mapBlocks(d, from, to, (b) => (off
    ? { ...b, list: undefined, indent: undefined, checked: undefined }
    : { ...b, type: "p", list: kind, ...(kind !== "check" ? { checked: undefined } : {}) }));
}
export const indent = (d: RichDoc, from: Pos, to: Pos, delta: number) =>
  mapBlocks(d, from, to, (b) => (b.list ? { ...b, indent: Math.min(MAX_INDENT, Math.max(0, (b.indent ?? 0) + delta)) || undefined } : b));

/** Tick or untick one checklist item. */
export function toggleChecked(d: RichDoc, b: number): RichDoc {
  const blk = d.blocks[b];
  if (!blk || blk.list !== "check") return d;
  const blocks = d.blocks.slice();
  blocks[b] = blk.checked ? { ...blk, checked: undefined } : { ...blk, checked: true };
  return withBlocks(d, blocks);
}

/** Change one block's own fields (an image's width, a caption). */
export function updateBlock(d: RichDoc, b: number, patch: Partial<Block>): RichDoc {
  const blk = d.blocks[b];
  if (!blk) return d;
  const blocks = d.blocks.slice();
  const next = { ...blk, ...patch } as Block;
  for (const k of Object.keys(patch) as (keyof Block)[]) if (patch[k] === undefined) delete next[k];
  blocks[b] = next;
  return withBlocks(d, blocks);
}
export function removeBlock(d: RichDoc, b: number): Result {
  const blocks = d.blocks.slice();
  blocks.splice(b, 1);
  const doc = withBlocks(d, blocks);
  const at = Math.min(b, doc.blocks.length - 1);
  return { doc, pos: { b: at, o: 0 } };
}
/** Move a block up or down past its neighbour. */
export function moveBlock(d: RichDoc, b: number, delta: -1 | 1): Result {
  const to = b + delta;
  if (to < 0 || to >= d.blocks.length) return { doc: d, pos: { b, o: 0 } };
  const blocks = d.blocks.slice();
  [blocks[b], blocks[to]] = [blocks[to], blocks[b]];
  return { doc: withBlocks(d, blocks), pos: { b: to, o: 0 } };
}

/**
 * An atom (rule, image, table…) at the caret: an empty line becomes it, otherwise it goes after the caret's block
 * (splitting the block when the caret is mid-text). A line to write on always follows it.
 */
export function insertAtom(d: RichDoc, p: Pos, atom: Block): Result {
  const blocks = d.blocks.slice();
  const cur = blocks[p.b];
  let at: number;
  if (!isAtom(cur) && blockLength(cur) === 0) { blocks[p.b] = atom; at = p.b; }
  else if (!isAtom(cur) && p.o > 0 && p.o < blockLength(cur)) {
    const [l, r] = splitSpans(cur.spans, p.o);
    blocks.splice(p.b, 1, { ...cur, spans: l }, atom, { ...cur, spans: r });
    return { doc: withBlocks(d, blocks), pos: { b: p.b + 1, o: 0 } };
  } else if (!isAtom(cur) && p.o === 0 && blockLength(cur) > 0) { blocks.splice(p.b, 0, atom); at = p.b; }
  else { blocks.splice(p.b + 1, 0, atom); at = p.b + 1; }
  if (!blocks[at + 1] || isAtom(blocks[at + 1])) blocks.splice(at + 1, 0, emptyBlock());
  return { doc: withBlocks(d, blocks), pos: { b: at, o: 0 } };
}
export const insertRule = (d: RichDoc, p: Pos): Result => {
  const r = insertAtom(d, p, { type: "hr", spans: [] });
  return { doc: r.doc, pos: { b: r.pos.b + 1, o: 0 } };
};

/** The whole run of a link around a caret (to edit or remove it). */
export function linkRange(d: RichDoc, p: Pos): [Pos, Pos] | null {
  const b = d.blocks[p.b];
  if (!b || isAtom(b)) return null;
  let at = 0;
  const runs = b.spans.map((s) => { const r = { s, a: at, z: at + s.text.length }; at = r.z; return r; });
  const i = runs.findIndex((r) => r.s.link && r.a < p.o && p.o <= r.z);
  const hit = i >= 0 ? i : runs.findIndex((r) => r.s.link && r.a === p.o);
  if (hit < 0) return null;
  const href = runs[hit].s.link;
  let a = hit;
  let z = hit;
  while (a > 0 && runs[a - 1].s.link === href) a--;
  while (z < runs.length - 1 && runs[z + 1].s.link === href) z++;
  return [{ b: p.b, o: runs[a].a }, { b: p.b, o: runs[z].z }];
}

/** The markdown-style starts, typed then a space at the beginning of a plain line. */
export const AUTO_FORMATS: Record<string, Partial<Block>> = {
  "-": { list: "bullet" }, "*": { list: "bullet" }, "•": { list: "bullet" }, "1.": { list: "ordered" }, "1)": { list: "ordered" },
  "[]": { list: "check" }, "[ ]": { list: "check" }, "[x]": { list: "check", checked: true },
  "#": { type: "h1" }, "##": { type: "h2" }, "###": { type: "h3" }, "####": { type: "h4" }, ">": { type: "quote" }, "```": { type: "code" },
};
/** `allowed` says whether the editor's schema has what a start would make. */
export function autoFormat(d: RichDoc, p: Pos, allowed: (f: Partial<Block>) => boolean = () => true): Result | null {
  const b = d.blocks[p.b];
  if (b.type !== "p" || b.list) return null;
  const before = blockText(b).slice(0, p.o);
  const hit = AUTO_FORMATS[before];
  if (!hit || !allowed(hit)) return null;
  const blocks = d.blocks.slice();
  blocks[p.b] = { ...b, ...hit, spans: sliceSpans(b.spans, p.o, blockLength(b)) };
  return { doc: withBlocks(d, blocks), pos: { b: p.b, o: 0 } };
}

// ── find ─────────────────────────────────────────────────────────────────────

/** Every match of `query` in the text blocks (case-insensitive unless asked). */
export function findAll(d: RichDoc, query: string, caseSensitive = false): [Pos, Pos][] {
  if (!query) return [];
  const q = caseSensitive ? query : query.toLowerCase();
  const out: [Pos, Pos][] = [];
  d.blocks.forEach((b, i) => {
    if (isAtom(b)) return;
    const text = caseSensitive ? blockText(b) : blockText(b).toLowerCase();
    for (let at = text.indexOf(q); at >= 0; at = text.indexOf(q, at + q.length)) out.push([{ b: i, o: at }, { b: i, o: at + q.length }]);
  });
  return out;
}
/** Replace every match, last first so earlier offsets hold; each keeps the formats of its first character. */
export function replaceAll(d: RichDoc, query: string, replacement: string, caseSensitive = false): { doc: RichDoc; count: number } {
  const hits = findAll(d, query, caseSensitive);
  let doc = d;
  for (let i = hits.length - 1; i >= 0; i--) {
    const [a, z] = hits[i];
    const marks = marksAt(doc, { b: a.b, o: a.o + 1 });
    doc = deleteRange(doc, a, z).doc;
    doc = insertText(doc, a, replacement, marks).doc;
  }
  return { doc, count: hits.length };
}

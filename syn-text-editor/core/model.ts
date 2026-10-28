/**
 * The document: a list of blocks, each a list of spans (a run of text and its formats). Never HTML — the editor
 * edits this, the viewer draws it, `toHTML` writes it out. Tables and media are blocks too ("atoms": the caret
 * steps over them; table cells hold their own spans).
 *
 *   { version: 1, blocks: [{ type: "h2", spans: [{ text: "Care" }] },
 *                          { type: "p", list: "bullet", spans: [{ text: "Cotton ", bold: true }, { text: "100%", size: 18 }] },
 *                          { type: "image", src: "https://…/a.jpg", width: 60, spans: [] }] }
 */

export type TextType = "p" | "h1" | "h2" | "h3" | "h4" | "quote" | "code";
export type AtomType = "hr" | "image" | "video" | "file" | "table";
export type BlockType = TextType | AtomType;
export type Align = "left" | "center" | "right" | "justify";
export type ListKind = "bullet" | "ordered" | "check";

export interface Marks {
  bold?: true;
  italic?: true;
  underline?: true;
  strike?: true;
  code?: true;
  script?: "sub" | "sup";
  /** px, SIZE_MIN–SIZE_MAX; none = the block's own size */
  size?: number;
  /** a CSS font-family stack, e.g. "Georgia, serif" */
  font?: string;
  /** a palette name ("red" → var(--se-c-red)) or a hex colour */
  color?: string;
  /** a palette name ("yellow" → var(--se-hl-yellow)) or a hex colour */
  highlight?: string;
  link?: string;
}
export interface Span extends Marks { text: string }
export interface Cell { spans: Span[]; align?: Exclude<Align, "left"> }

export interface Block {
  type: BlockType;
  /** text: never "left" (the default); media: "left" or "right", centred when absent */
  align?: Align;
  list?: ListKind;
  /** a ticked checklist item */
  checked?: true;
  /** list nesting, 0–MAX_INDENT */
  indent?: number;
  spans: Span[];
  // ── media (image / video / file) ──
  src?: string;
  alt?: string;
  caption?: string;
  /** percent of the content width, 10–100 */
  width?: number;
  name?: string;
  mime?: string;
  bytes?: number;
  /** the storage id it came from, so the gallery can find it again */
  asset?: string;
  /** video: the thumbnail shown before it plays — an image address */
  poster?: string;
  // ── table ──
  rows?: Cell[][];
  /** the first row is a header */
  head?: true;
}
export interface RichDoc { version: 1; blocks: Block[] }

export const MARK_KEYS = ["bold", "italic", "underline", "strike", "code", "script", "size", "font", "color", "highlight", "link"] as const;
export type MarkKey = (typeof MARK_KEYS)[number];
export const TOGGLES = ["bold", "italic", "underline", "strike", "code"] as const;
export type Toggle = (typeof TOGGLES)[number];
export const TEXT_TYPES: TextType[] = ["p", "h1", "h2", "h3", "h4", "quote", "code"];
export const ATOM_TYPES: AtomType[] = ["hr", "image", "video", "file", "table"];
export const MAX_INDENT = 6;
export const SIZE_MIN = 8;
export const SIZE_MAX = 96;

export const BLOCK_LABEL: Record<TextType, string> = {
  p: "Paragraph", h1: "Heading 1", h2: "Heading 2", h3: "Heading 3", h4: "Heading 4", quote: "Quote", code: "Code block",
};
/** The size text has in each block when no size is set — keep in step with layout.css. */
export const BLOCK_SIZE: Record<BlockType, number> = {
  p: 15, h1: 30, h2: 24, h3: 19, h4: 16, quote: 15, code: 13, hr: 15, image: 15, video: 15, file: 15, table: 14,
};

const ATOMS = new Set<string>(ATOM_TYPES);
const TYPES = new Set<string>([...TEXT_TYPES, ...ATOM_TYPES]);
export const isAtom = (b: Block | undefined): boolean => !!b && ATOMS.has(b.type);
export const isText = (b: Block | undefined): boolean => !!b && !ATOMS.has(b.type);

const SAFE_LINK = /^(https?:\/\/|mailto:|tel:|\/|#)/i;
const SAFE_SRC = /^(https?:\/\/|\/|\.{0,2}\/|blob:|data:(image|video)\/[a-z0-9.+-]+;base64,)/i;
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const TOKEN = /^[a-z][a-z0-9-]{0,23}$/;
const FONT = /^[\w\s,'"-]{1,120}$/;

export const clampSize = (n: number) => Math.min(SIZE_MAX, Math.max(SIZE_MIN, Math.round(n)));
export const clampWidth = (n: number) => Math.min(100, Math.max(10, Math.round(n)));

/** An address safe to put in href: http(s), mailto, tel, a path, or a bare domain (made https). */
export const safeLink = (href: unknown): string | undefined => {
  const v = (typeof href === "string" ? href : "").trim();
  if (!v) return undefined;
  const full = SAFE_LINK.test(v) ? v : /^[\w.-]+\.[a-z]{2,}(\/|$|\?|#)/i.test(v) ? `https://${v}` : "";
  return full && full.length <= 2000 ? full : undefined;
};
/** An address safe for an image only (a video's thumbnail): like `safeSrc`, but inline data must be an image. */
export const safePoster = (src: unknown): string | undefined => {
  const v = safeSrc(src);
  return v && (!/^data:/i.test(v) || /^data:image\//i.test(v)) ? v : undefined;
};
/** An address safe for src: http(s), a path, a blob, or an inline image/video. */
export const safeSrc = (src: unknown): string | undefined => {
  const v = (typeof src === "string" ? src : "").trim();
  return v && SAFE_SRC.test(v) && !/^javascript:/i.test(v) ? v : undefined;
};
export const safeColor = (c: unknown): string | undefined =>
  typeof c === "string" && (HEX.test(c) || TOKEN.test(c)) ? c.toLowerCase() : undefined;
export const safeFont = (f: unknown): string | undefined => (typeof f === "string" && FONT.test(f.trim()) ? f.trim() : undefined);

export const marksOf = (s: Marks): Marks => {
  const m: Marks = {};
  for (const k of MARK_KEYS) if (s[k] !== undefined) (m as Record<string, unknown>)[k] = s[k];
  return m;
};
export const sameMarks = (a: Marks, b: Marks) => MARK_KEYS.every((k) => a[k] === b[k]);
export const spansLength = (spans: Span[]) => spans.reduce((n, s) => n + s.text.length, 0);
export const spansText = (spans: Span[]) => spans.map((s) => s.text).join("");
export const blockText = (b: Block) => spansText(b.spans);
export const blockLength = (b: Block) => (isAtom(b) ? 0 : spansLength(b.spans));

/** Drop empty spans, join neighbours with the same formats. */
export function normaliseSpans(spans: Span[]): Span[] {
  const out: Span[] = [];
  for (const s of spans) {
    if (!s.text) continue;
    const last = out[out.length - 1];
    if (last && sameMarks(last, s)) out[out.length - 1] = { ...last, text: last.text + s.text };
    else out.push(s);
  }
  return out;
}

export const emptyBlock = (from?: Partial<Block>): Block => ({ type: "p", ...(from?.align ? { align: from.align } : {}), spans: [] });
export const emptyDoc = (): RichDoc => ({ version: 1, blocks: [emptyBlock()] });
export const emptyCell = (): Cell => ({ spans: [] });
export const isEmptyDoc = (d: RichDoc | null | undefined) =>
  !d || d.blocks.every((b) => !isAtom(b) && !b.list && b.type === "p" && !blockText(b).trim());

/** Text only: a line per block, list items marked, table cells tab-separated (search, counters, previews). */
export function docToPlain(d: RichDoc | null | undefined): string {
  if (!d) return "";
  const n: number[] = [];
  return d.blocks.map((b) => {
    if (b.type === "hr") return "—";
    if (b.type === "image" || b.type === "video") return b.caption || b.alt || "";
    if (b.type === "file") return b.name || b.src || "";
    if (b.type === "table") return (b.rows ?? []).map((r) => r.map((c) => spansText(c.spans).replace(/\n/g, " ")).join("\t")).join("\n");
    const depth = b.indent ?? 0;
    n.length = b.list ? depth + 1 : 0;
    if (b.list === "ordered") n[depth] = (n[depth] ?? 0) + 1;
    const lead = !b.list ? "" : `${"  ".repeat(depth)}${b.list === "ordered" ? `${n[depth]}.` : b.list === "check" ? (b.checked ? "[x]" : "[ ]") : "•"} `;
    return lead + blockText(b);
  }).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
/** Characters of text (formatting, line ends and media not counted; table cells are). */
export const docLength = (d: RichDoc | null | undefined) => (d ? countText(d, (t) => t.replace(/\n/g, "").length) : 0);
/** Words of text, the way a word processor counts them. */
export const docWords = (d: RichDoc | null | undefined) => (d ? countText(d, (t) => (t.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length) : 0);
function countText(d: RichDoc, count: (text: string) => number) {
  let n = 0;
  for (const b of d.blocks) {
    if (b.type === "table") for (const r of b.rows ?? []) for (const c of r) n += count(spansText(c.spans));
    else if (!isAtom(b)) n += count(blockText(b));
  }
  return n;
}

export function plainToBlocks(text: string): Block[] {
  return text.replace(/\r\n?/g, "\n").split("\n").map((line) => ({ type: "p" as const, spans: line ? [{ text: line }] : [] }));
}
export const plainToDoc = (text: string): RichDoc => ({ version: 1, blocks: plainToBlocks(text.trim()) });

// ── the schema: what an editor allows ────────────────────────────────────────

/**
 * Everything a document may hold, by name. An editor configured with a subset keeps only that — what the toolbar
 * offers, what typing shortcuts make, and what survives a paste from Word.
 */
export type Format =
  | Toggle | "script" | "size" | "font" | "color" | "highlight" | "link"
  | TextType | "bullet" | "ordered" | "check" | "align" | "indent"
  | AtomType;

export const ALL_FORMATS: Format[] = [
  "bold", "italic", "underline", "strike", "code", "script", "size", "font", "color", "highlight", "link",
  "p", "h1", "h2", "h3", "h4", "quote", "code", "bullet", "ordered", "check", "align", "indent",
  "hr", "image", "video", "file", "table",
];
export interface Schema { has: (f: Format) => boolean; formats: ReadonlySet<Format> }
export const schemaOf = (formats?: readonly Format[] | null): Schema => {
  const set = new Set<Format>(formats ?? ALL_FORMATS);
  set.add("p");
  return { has: (f) => set.has(f), formats: set };
};
export const FULL_SCHEMA = schemaOf(null);

/** Keep only what the model (and the schema) allows — pasted, stored or older data. */
export function cleanBlock(raw: unknown, schema: Schema = FULL_SCHEMA): Block | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  let type = (TYPES.has(r.type as string) ? r.type : "p") as BlockType;
  if (type === "code" && !schema.has("code") && schema.has("p")) type = "p";
  if (!schema.has(type)) {
    if (ATOMS.has(type)) return type === "table" ? tableAsParagraphs(r, schema) : null;
    type = "p";
  }
  const b: Block = { type, spans: [] };
  if (schema.has("align") && (r.align === "center" || r.align === "right" || r.align === "justify")) b.align = r.align;
  if ((type === "image" || type === "video") && (r.align === "left" || r.align === "right")) b.align = r.align;
  else if (type === "image" || type === "video") delete b.align;
  if (type === "p" && (r.list === "bullet" || r.list === "ordered" || r.list === "check") && schema.has(r.list)) {
    b.list = r.list;
    if (r.list === "check" && r.checked === true) b.checked = true;
    const i = Number(r.indent);
    if (i > 0 && schema.has("indent")) b.indent = Math.min(MAX_INDENT, Math.floor(i));
  }
  if (!ATOMS.has(type)) {
    if (Array.isArray(r.spans)) b.spans = cleanSpans(r.spans, schema);
    return b;
  }
  if (type === "image" || type === "video" || type === "file") {
    const src = safeSrc(r.src as string);
    if (!src) return null;
    b.src = src;
    for (const k of ["alt", "caption", "name", "mime", "asset"] as const) if (typeof r[k] === "string" && r[k]) b[k] = (r[k] as string).slice(0, 500);
    if (typeof r.width === "number" && Number.isFinite(r.width) && r.width < 100) b.width = clampWidth(r.width);
    if (typeof r.bytes === "number" && Number.isFinite(r.bytes) && r.bytes >= 0) b.bytes = Math.floor(r.bytes);
    if (type === "video") { const poster = safePoster(r.poster as string); if (poster) b.poster = poster; }
  }
  if (type === "table") {
    const rows = Array.isArray(r.rows) ? r.rows.filter(Array.isArray) as unknown[][] : [];
    const cols = Math.min(20, Math.max(1, ...rows.map((x) => x.length)));
    if (!rows.length) return null;
    b.rows = rows.slice(0, 200).map((row) => Array.from({ length: cols }, (_, i) => {
      const c = row[i] as Record<string, unknown> | undefined;
      const cell: Cell = { spans: c && Array.isArray(c.spans) ? cleanSpans(c.spans, schema) : [] };
      if (c && schema.has("align") && (c.align === "center" || c.align === "right" || c.align === "justify")) cell.align = c.align;
      return cell;
    }));
    if (r.head === true) b.head = true;
  }
  return b;
}
/** A table where tables aren't allowed: a line per row. */
function tableAsParagraphs(r: Record<string, unknown>, schema: Schema): Block | null {
  const rows = Array.isArray(r.rows) ? r.rows as { spans?: unknown[] }[][] : [];
  const spans: Span[] = [];
  rows.forEach((row, i) => {
    if (i) spans.push({ text: "\n" });
    row.forEach((c, j) => {
      if (j) spans.push({ text: "\t" });
      spans.push(...cleanSpans(Array.isArray(c?.spans) ? c.spans : [], schema));
    });
  });
  return spans.length ? { type: "p", spans: normaliseSpans(spans) } : null;
}
export function cleanSpans(raw: unknown[], schema: Schema = FULL_SCHEMA): Span[] {
  return normaliseSpans(raw.map((s) => cleanSpan(s, schema)).filter((s): s is Span => !!s));
}
function cleanSpan(raw: unknown, schema: Schema): Span | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.text !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const s: Span = { text: r.text.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "") };
  for (const k of TOGGLES) if (r[k] === true && schema.has(k)) s[k] = true;
  if ((r.script === "sub" || r.script === "sup") && schema.has("script")) s.script = r.script;
  if (typeof r.size === "number" && Number.isFinite(r.size) && schema.has("size")) s.size = clampSize(r.size);
  if (schema.has("font")) { const f = safeFont(r.font); if (f) s.font = f; }
  if (schema.has("color")) { const c = safeColor(r.color); if (c) s.color = c; }
  if (schema.has("highlight")) { const c = safeColor(r.highlight); if (c) s.highlight = c; }
  if (schema.has("link")) { const link = typeof r.link === "string" ? safeLink(r.link) : undefined; if (link) s.link = link; }
  return s;
}

export const isDoc = (v: unknown): v is RichDoc =>
  !!v && typeof v === "object" && Array.isArray((v as RichDoc).blocks);

/** Anything stored or typed → a document: a document, its JSON, or plain text. */
export function toDoc(value: unknown, schema: Schema = FULL_SCHEMA): RichDoc | null {
  if (value == null || value === "") return null;
  if (typeof value === "string") {
    const t = value.trim();
    if (t.startsWith("{")) {
      try { return toDoc(JSON.parse(t), schema); } catch { /* plain text that starts with a brace */ }
    }
    return t ? plainToDoc(t) : null;
  }
  if (!isDoc(value)) return null;
  const blocks = value.blocks.map((b) => cleanBlock(b, schema)).filter((b): b is Block => !!b);
  return { version: 1, blocks: blocks.length ? blocks : [emptyBlock()] };
}

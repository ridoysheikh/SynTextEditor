/**
 * HTML in and out.
 *
 * Out (`toHTML`, pure strings — runs on a server): `"class"` writes `se-*` classes for pages that load layout.css;
 * `"inline"` writes self-contained inline styles for email, other apps and the clipboard.
 *
 * In (`parseHtml`, browser only — DOMParser): pasted HTML from Word, Google Docs, web pages or another editor is
 * read into the model — bold, italic, underline, strike, sizes (px / pt / em / %), exact colours, fonts, alignment,
 * headings, lists, checklists, links, tables, images and video; everything else is dropped. HTML this editor wrote
 * carries the exact blocks in `data-syn`, so pasting between editors loses nothing.
 */
import {
  BLOCK_SIZE, cleanBlock, clampSize, FULL_SCHEMA, isAtom, normaliseSpans, safeFont, safeLink, safePoster, safeSrc,
  type Block, type BlockType, type Cell, type Marks, type Schema, type Span,
} from "./model";
import { blockClass, blockData, cssText, formatBytes, listMarkers, spanClass, spanStyle } from "./styles";

// ── out ──────────────────────────────────────────────────────────────────────

export interface HtmlOptions {
  /** "class" (default): `se-*` classes for a page that loads the stylesheet. "inline": self-contained styles. */
  mode?: "class" | "inline";
  /** Wrap in `<div class="se-content">` (class mode) — default true. */
  wrap?: boolean;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function spanHtml(s: Span, inline: boolean): string {
  const { text, ...m } = s;
  const css = cssText(spanStyle(m, inline));
  const cls = inline ? "" : spanClass(m);
  let inner = esc(text).replace(/\n/g, "<br>");
  if (m.code && inline) inner = `<code>${inner}</code>`;
  if (m.script) inner = `<${m.script}>${inner}</${m.script}>`;
  const attrs = `${cls ? ` class="${cls}"` : ""}${css ? ` style="${esc(css)}"` : ""}`;
  if (m.link) return `<a href="${esc(m.link)}" target="_blank" rel="noopener noreferrer"${attrs}>${inner}</a>`;
  if (inline) {
    if (m.bold && !css.includes("font-weight")) inner = `<strong>${inner}</strong>`;
    return css ? `<span${attrs}>${inner}</span>` : inner;
  }
  return attrs ? `<span${attrs}>${inner}</span>` : inner;
}
const spansHtml = (spans: Span[], inline: boolean) => spans.map((s) => spanHtml(s, inline)).join("");

function dataAttrs(b: Block): string {
  return Object.entries(blockData(b)).map(([k, v]) => ` data-${k}="${esc(v)}"`).join("");
}

function atomHtml(b: Block, inline: boolean): string {
  const width = b.width ? (inline ? `max-width:${b.width}%;` : `width:${b.width}%`) : "";
  const align = b.align ?? "center";
  const fig = inline ? ` style="margin:1em 0;text-align:${align}"` : ` class="${blockClass(b)}"${b.align ? ` data-align="${b.align}"` : ""}`;
  const cap = b.caption ? `<figcaption${inline ? ' style="font-size:0.85em;opacity:.7;margin-top:.4em"' : ' class="se-caption"'}>${esc(b.caption)}</figcaption>` : "";
  switch (b.type) {
    case "hr": return inline ? '<hr style="border:none;border-top:1px solid #d0d4dc;margin:1em 0">' : `<hr class="${blockClass(b)}">`;
    case "image":
      return `<figure${fig}><img src="${esc(b.src ?? "")}" alt="${esc(b.alt ?? "")}"${inline ? ` style="${width}height:auto;border-radius:6px"` : width ? ` style="${width}"` : ""}>${cap}</figure>`;
    case "video":
    {
      // Class mode wraps it for the library's player (`mountPlayers`); `controls` is the fallback without script.
      const poster = b.poster ? ` poster="${esc(b.poster)}"` : "";
      if (inline) return `<figure${fig}><video src="${esc(b.src ?? "")}"${poster} controls preload="metadata" style="${width}width:100%;border-radius:6px"></video>${cap}</figure>`;
      return `<figure${fig}><div class="se-player"${width ? ` style="${width}"` : ""}><video src="${esc(b.src ?? "")}"${poster} controls preload="metadata" playsinline></video></div>${cap}</figure>`;
    }
    case "file": {
      const label = esc(b.name || b.src || "file");
      const size = b.bytes !== undefined ? ` <span${inline ? ' style="opacity:.6"' : ' class="se-file-size"'}>(${formatBytes(b.bytes)})</span>` : "";
      return inline
        ? `<p style="margin:1em 0"><a href="${esc(b.src ?? "")}" download target="_blank" rel="noopener noreferrer">📎 ${label}</a>${size}</p>`
        : `<div class="${blockClass(b)}"><a class="se-file-link" href="${esc(b.src ?? "")}" download target="_blank" rel="noopener noreferrer"><span class="se-file-name">${label}</span>${size}</a></div>`;
    }
    case "table": {
      const rows = b.rows ?? [];
      const cellCss = 'border:1px solid #d0d4dc;padding:6px 8px;vertical-align:top';
      const cell = (c: Cell, tag: "td" | "th") => {
        const a = c.align ? (inline ? `;text-align:${c.align}` : "") : "";
        const attrs = inline ? ` style="${cellCss}${a}"` : c.align ? ` data-align="${c.align}"` : "";
        return `<${tag}${attrs}>${spansHtml(c.spans, inline) || (inline ? "&nbsp;" : "")}</${tag}>`;
      };
      const body = rows.map((r, i) => `<tr>${r.map((c) => cell(c, b.head && i === 0 ? "th" : "td")).join("")}</tr>`);
      const head = b.head && body.length ? `<thead>${body.shift()}</thead>` : "";
      return inline
        ? `<table style="border-collapse:collapse;width:100%;margin:1em 0">${head}<tbody>${body.join("")}</tbody></table>`
        : `<div class="${blockClass(b)}"><table class="se-table">${head}<tbody>${body.join("")}</tbody></table></div>`;
    }
    default: return "";
  }
}

/** Blocks → HTML. Lists are written as `<ul>/<ol>` runs, nesting kept as indentation. */
export function blocksToHtml(blocks: Block[], opts: HtmlOptions = {}): string {
  const inline = opts.mode === "inline";
  const markers = listMarkers(blocks);
  let html = "";
  let open: string | null = null;
  blocks.forEach((b, i) => {
    const tag = b.list ? (b.list === "ordered" ? "ol" : "ul") : null;
    if (open && open !== tag) { html += `</${open}>`; open = null; }
    if (tag && !open) {
      html += `<${tag}${inline ? ` style="margin:0.25em 0;padding-left:1.5em${b.list === "check" ? ";list-style:none" : ""}"` : ` class="se-list"`}${b.list === "check" ? ' data-type="check"' : ""}>`;
      open = tag;
    }
    if (isAtom(b)) { html += atomHtml(b, inline); return; }
    const inner = spansHtml(b.spans, inline) || "<br>";
    if (tag) {
      const box = b.list === "check" ? (inline ? `${b.checked ? "☑" : "☐"} ` : "") : "";
      const style = inline ? [b.align && `text-align:${b.align}`, b.indent && `margin-left:${b.indent * 1.5}em`, b.checked && "text-decoration:line-through;opacity:.7"].filter(Boolean).join(";") : "";
      const attrs = inline
        ? `${style ? ` style="${style}"` : ""}`
        : ` class="${blockClass(b)}"${dataAttrs(b)} data-marker="${esc(markers[i] ?? "")}"`;
      html += `<li${attrs}${b.list === "ordered" ? ` value="${(markers[i] ?? "").replace(".", "")}"` : ""}>${box}${inner}</li>`;
      return;
    }
    const el = b.type === "quote" ? "blockquote" : b.type === "code" ? "pre" : b.type;
    if (inline) {
      const css = [
        b.align && `text-align:${b.align}`,
        b.type === "quote" && "border-left:3px solid #d0d4dc;padding-left:12px;color:#6b7280;margin:0.5em 0",
        b.type === "code" && "font-family:ui-monospace,monospace;background:#f3f4f6;padding:10px 12px;border-radius:6px;white-space:pre-wrap",
        b.type === "p" && "margin:0.5em 0",
      ].filter(Boolean).join(";");
      html += `<${el}${css ? ` style="${css}"` : ""}>${inner}</${el}>`;
    } else html += `<${el} class="${blockClass(b)}"${dataAttrs(b)}>${inner}</${el}>`;
  });
  if (open) html += `</${open}>`;
  return html;
}

/** A document → HTML (see `HtmlOptions`). Safe to call on a server. */
export function toHTML(doc: { blocks: Block[] } | null | undefined, opts: HtmlOptions = {}): string {
  if (!doc) return "";
  const body = blocksToHtml(doc.blocks, opts);
  return opts.mode !== "inline" && opts.wrap !== false ? `<div class="se-content">${body}</div>` : body;
}

/** Clipboard HTML: inline styles other apps keep, plus the exact blocks for this editor. */
export const clipboardHtml = (blocks: Block[]) =>
  `<div data-syn="${esc(JSON.stringify(blocks))}">${blocksToHtml(blocks, { mode: "inline" })}</div>`;

// ── in ───────────────────────────────────────────────────────────────────────

const SKIP = new Set(["SCRIPT", "STYLE", "HEAD", "META", "TITLE", "TEMPLATE", "NOSCRIPT", "SVG", "IFRAME", "OBJECT", "BUTTON", "SELECT", "INPUT", "TEXTAREA", "LINK"]);
const BLOCKS = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "BLOCKQUOTE", "PRE", "SECTION", "ARTICLE", "HEADER", "FOOTER", "FIGCAPTION", "DT", "DD", "ADDRESS", "FIGURE", "MAIN", "ASIDE", "NAV"]);
const HEADING: Record<string, BlockType> = { H1: "h1", H2: "h2", H3: "h3", H4: "h4", H5: "h4", H6: "h4" };
const FONT_TAG_SIZE = [0, 10, 13, 16, 18, 24, 32, 48];

function rgb(c: string): [number, number, number, number] | null {
  const v = c.trim().toLowerCase();
  let m = v.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    const h = m[1].length <= 4 ? m[1].split("").map((x) => x + x).join("") : m[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
  }
  m = v.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map((x) => (x.endsWith("%") ? parseFloat(x) * 2.55 : parseFloat(x)));
    return [p[0], p[1], p[2], p[3] === undefined ? 1 : p[3] > 1 ? p[3] / 255 : p[3]];
  }
  const named: Record<string, [number, number, number]> = {
    red: [255, 0, 0], green: [0, 128, 0], blue: [0, 0, 255], orange: [255, 165, 0], yellow: [255, 255, 0], gray: [128, 128, 128],
    grey: [128, 128, 128], purple: [128, 0, 128], white: [255, 255, 255], black: [0, 0, 0],
  };
  return named[v] ? [...named[v], 1] : null;
}
const hex = ([r, g, b]: number[]) => `#${[r, g, b].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("")}`;
const luma = ([r, g, b]: number[]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/** A pasted text colour → hex; plain black and near-black are the default ink and dropped (they'd vanish on dark themes). */
export function colorOf(color: string): string | undefined {
  const c = rgb(color);
  if (!c || c[3] < 0.3) return undefined;
  const sat = Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);
  if (luma(c) < 0.2 && sat < 40) return undefined;
  if (luma(c) > 0.94) return undefined;
  return hex(c);
}
/** A pasted background → hex (white / clear → none). */
export function highlightOf(color: string): string | undefined {
  const c = rgb(color);
  if (!c || c[3] < 0.2) return undefined;
  if (luma(c) > 0.97) return undefined;
  return hex(c);
}
/** A CSS font size → px, relative ones against the size around it. */
export function pxOf(value: string, around: number): number | undefined {
  const m = value.trim().toLowerCase().match(/^([\d.]+)(px|pt|em|rem|%)?$/);
  if (!m) {
    const words: Record<string, number> = { "xx-small": 9, "x-small": 10, small: 13, medium: 16, large: 18, "x-large": 24, "xx-large": 32 };
    return words[value.trim()];
  }
  const n = parseFloat(m[1]);
  const px = m[2] === "pt" ? (n * 4) / 3 : m[2] === "em" ? n * around : m[2] === "rem" ? n * 16 : m[2] === "%" ? (n / 100) * around : n;
  return Number.isFinite(px) && px > 0 ? clampSize(px) : undefined;
}

interface Ctx { marks: Marks; size: number; list: Block["list"]; depth: number; type: BlockType; align?: Block["align"]; pre: boolean; checked?: boolean }

/** Pasted HTML → blocks, kept to what `schema` allows. */
export function parseHtml(html: string, schema: Schema = FULL_SCHEMA): Block[] {
  const body = new DOMParser().parseFromString(html, "text/html").body;
  const own = body.querySelector("[data-syn]");
  if (own) {
    try {
      const parsed = JSON.parse(own.getAttribute("data-syn") ?? "[]");
      if (Array.isArray(parsed)) return parsed.map((b) => cleanBlock(b, schema)).filter((b): b is Block => !!b);
    } catch { /* fall through to reading the HTML */ }
  }
  return parseNodes(body).map((b) => cleanBlock(b, schema)).filter((b): b is Block => !!b);
}

/** Any DOM subtree → blocks (unfiltered — `parseHtml` applies the schema). */
export function parseNodes(root: Node, base: Partial<Ctx> = {}): Block[] {
  const out: Block[] = [];
  let cur: Block | null = null;
  const start = (ctx: Ctx) => {
    cur = {
      type: ctx.type, spans: [], ...(ctx.align ? { align: ctx.align } : {}),
      ...(ctx.list && ctx.type === "p" ? { list: ctx.list, ...(ctx.depth ? { indent: ctx.depth } : {}), ...(ctx.checked ? { checked: true as const } : {}) } : {}),
    };
    out.push(cur);
  };
  const end = () => { cur = null; };

  /** A cell's inline content as spans (nested blocks become line breaks). */
  const cellSpans = (el: HTMLElement, ctx: Ctx): Span[] => {
    const inner = parseNodes(el, { ...ctx, list: undefined, type: "p", align: undefined });
    const spans: Span[] = [];
    inner.forEach((b, i) => { if (i) spans.push({ text: "\n" }); spans.push(...b.spans); });
    return normaliseSpans(spans);
  };

  const walk = (node: Node, ctx: Ctx) => {
    if (node.nodeType === Node.TEXT_NODE) {
      let text = (node as Text).data;
      if (!ctx.pre) text = text.replace(/[ \t\r\n\f]+/g, " ").replace(/ /g, " ");
      if (!text) return;
      if (!cur) {
        if (!text.trim()) return;
        start(ctx);
      }
      const blk = cur as unknown as Block;
      if (!blk.spans.length && !ctx.pre) text = text.replace(/^ +/, "");
      if (text) blk.spans.push({ ...ctx.marks, ...(ctx.size !== BLOCK_SIZE[blk.type] ? { size: ctx.size } : {}), text });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName;
    if (SKIP.has(tag) || el.hidden || el.style?.display === "none") return;
    if (tag === "BR") {
      if (!cur) start(ctx);
      (cur as unknown as Block).spans.push({ ...ctx.marks, text: "\n" });
      return;
    }
    if (tag === "HR") { end(); out.push({ type: "hr", spans: [] }); return; }
    if (tag === "IMG" || tag === "VIDEO") {
      const src = safeSrc(el.getAttribute("src") ?? el.querySelector("source")?.getAttribute("src"));
      if (!src) {
        const alt = el.getAttribute("alt")?.trim();
        if (alt) walk(document.createTextNode(alt), ctx);
        return;
      }
      end();
      const caption = el.closest("figure")?.querySelector("figcaption")?.textContent?.trim();
      const w = parseFloat(el.style?.width || el.style?.maxWidth || "");
      out.push({
        type: tag === "IMG" ? "image" : "video", src, spans: [],
        ...(el.getAttribute("alt") ? { alt: el.getAttribute("alt")! } : {}), ...(caption ? { caption } : {}),
        ...(tag === "VIDEO" && safePoster(el.getAttribute("poster")) ? { poster: safePoster(el.getAttribute("poster"))! } : {}),
        ...(el.style?.width?.endsWith("%") && w > 0 && w < 100 ? { width: w } : {}),
      });
      return;
    }
    if (tag === "FIGCAPTION" && el.parentElement?.querySelector("img,video")) return;     // taken with its image
    if (tag === "TABLE") {
      end();
      const rows: Cell[][] = [];
      let head = false;
      el.querySelectorAll("tr").forEach((tr, i) => {
        if (tr.closest("table") !== el) return;                                            // a nested table's rows
        const cells = Array.from(tr.children).filter((c) => c.tagName === "TD" || c.tagName === "TH") as HTMLElement[];
        if (i === 0 && cells.length && cells.every((c) => c.tagName === "TH")) head = true;
        rows.push(cells.map((c) => {
          const a = (c.style?.textAlign || c.getAttribute("align") || "").toLowerCase();
          return { spans: cellSpans(c, ctx), ...(a === "center" || a === "right" || a === "justify" ? { align: a } : {}) };
        }));
      });
      if (rows.length) out.push({ type: "table", spans: [], rows, ...(head ? { head: true as const } : {}) });
      return;
    }

    const next: Ctx = { ...ctx, marks: { ...ctx.marks } };
    if (tag === "B" || tag === "STRONG") next.marks.bold = true;
    if (tag === "I" || tag === "EM" || tag === "CITE" || tag === "DFN") next.marks.italic = true;
    if (tag === "U" || tag === "INS") next.marks.underline = true;
    if (tag === "S" || tag === "STRIKE" || tag === "DEL") next.marks.strike = true;
    if ((tag === "CODE" || tag === "KBD" || tag === "SAMP" || tag === "TT") && !ctx.pre) next.marks.code = true;
    if (tag === "SUB") next.marks.script = "sub";
    if (tag === "SUP") next.marks.script = "sup";
    if (tag === "MARK") next.marks.highlight = "yellow";
    if (tag === "A") { const href = safeLink(el.getAttribute("href")); if (href) next.marks.link = href; }
    if (tag === "FONT") {
      const n = Number(el.getAttribute("size"));
      if (n >= 1 && n <= 7) next.size = FONT_TAG_SIZE[n];
      const c = el.getAttribute("color") && colorOf(el.getAttribute("color")!);
      if (c) next.marks.color = c;
      const f = safeFont(el.getAttribute("face"));
      if (f) next.marks.font = f;
    }
    const st = el.style;
    if (st) {
      const fw = st.fontWeight;
      if (fw === "bold" || fw === "bolder" || Number(fw) >= 600) next.marks.bold = true;
      else if (fw === "normal" || (fw && Number(fw) < 600)) delete next.marks.bold;
      if (st.fontStyle === "italic" || st.fontStyle === "oblique") next.marks.italic = true;
      else if (st.fontStyle === "normal") delete next.marks.italic;
      const deco = `${st.textDecorationLine || ""} ${st.textDecoration || ""}`;
      if (deco.includes("underline")) next.marks.underline = true;
      if (deco.includes("line-through")) next.marks.strike = true;
      if (st.verticalAlign === "sub") next.marks.script = "sub";
      if (st.verticalAlign === "super") next.marks.script = "sup";
      if (st.fontFamily) {
        if (/mono|courier|consolas/i.test(st.fontFamily) && !ctx.pre) next.marks.code = true;
        else { const f = safeFont(st.fontFamily); if (f && !/^(inherit|initial|-apple-system|system-ui)$/i.test(f)) next.marks.font = f; }
      }
      if (st.fontSize) { const px = pxOf(st.fontSize, ctx.size); if (px) next.size = px; }
      if (st.color) { const c = colorOf(st.color); if (c) next.marks.color = c; else delete next.marks.color; }
      const bg = st.backgroundColor || (st.background && rgb(st.background) ? st.background : "");
      if (bg) { const h = highlightOf(bg); if (h) next.marks.highlight = h; }
    }

    const isBlock = BLOCKS.has(tag) || tag === "UL" || tag === "OL" || st?.display === "block";
    if (isBlock) {
      if (HEADING[tag]) { next.type = HEADING[tag]; next.size = BLOCK_SIZE[next.type]; next.list = undefined; }
      if (tag === "BLOCKQUOTE") next.type = "quote";
      if (tag === "PRE") { next.pre = true; next.type = "code"; delete next.marks.code; next.size = BLOCK_SIZE.code; }
      if (tag === "UL" || tag === "OL") {
        next.depth = ctx.list ? ctx.depth + 1 : 0;
        const check = el.getAttribute("data-type") === "check" || el.classList.contains("contains-task-list");
        next.list = tag === "OL" ? "ordered" : check ? "check" : "bullet";
      }
      if (tag === "LI") {
        const box = el.querySelector(":scope > input[type=checkbox]") as HTMLInputElement | null;
        if (box) next.list = "check";
        next.checked = box ? box.checked || box.hasAttribute("checked") : el.getAttribute("data-checked") !== null;
      }
      const align = (st?.textAlign || el.getAttribute("align") || el.getAttribute("data-align") || "").toLowerCase();
      if (align === "center" || align === "right" || align === "justify") next.align = align;
      else if (align === "left" || align === "start") next.align = undefined;
      const levelAttr = Number(el.getAttribute("aria-level"));          // Google Docs marks nesting this way
      if (tag === "LI" && levelAttr > 1) next.depth = levelAttr - 1;
      const blank = cur as Block | null;
      if (blank && !blank.spans.length && tag !== "LI" && !blank.list === !next.list) {   // <li><p>…</p></li>: one block, not two
        if (next.type !== "p") blank.type = next.type;
        if (next.align) blank.align = next.align;
      } else if (tag === "LI" || BLOCKS.has(tag)) { end(); start(next); }
    }
    el.childNodes.forEach((c) => walk(c, next));
    if (isBlock) end();
  };

  walk(root, { marks: {}, size: BLOCK_SIZE.p, list: undefined, depth: 0, type: "p", pre: false, ...base });
  const blocks = out.map((b) => (isAtom(b) ? b : { ...b, spans: normaliseSpans(b.type === "code" ? b.spans : trimEnd(b.spans)) }));
  return blocks.filter((b, i) => isAtom(b) || b.spans.length                 // a blank line between two kept lines stays
    || (i > 0 && i < blocks.length - 1 && blocks[i - 1].spans.length > 0 && !b.list));
}
function trimEnd(spans: Span[]): Span[] {
  const s = spans.slice();
  while (s.length && /^[ \n]*$/.test(s[s.length - 1].text)) s.pop();
  if (s.length) s[s.length - 1] = { ...s[s.length - 1], text: s[s.length - 1].text.replace(/ +$/, "") };
  return s;
}

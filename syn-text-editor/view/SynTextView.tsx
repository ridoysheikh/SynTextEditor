// ─── The viewer ───────────────────────────────────────────────────────────────
// Shows a document the editor wrote — drawn as React elements with the same classes and styles the editor uses,
// never as HTML, so nothing in a document can inject markup. No hooks and no browser APIs: it renders in a React
// Server Component as happily as in the browser.

import { createElement, type CSSProperties, type ReactNode } from "react";
import { isAtom, toDoc, type Block, type Cell, type RichDoc, type Span } from "../core/model";
import { blockClass, blockData, formatBytes, listMarkers, spanClass, spanStyle } from "../core/styles";

export interface SynTextViewProps {
  /** A document, its JSON, or plain text. */
  value: RichDoc | string | null | undefined;
  className?: string;
  style?: CSSProperties;
  /** "light", "dark", or "inherit" (default: a `.dark` ancestor switches it). */
  theme?: "light" | "dark" | "inherit";
  /** "compact" (default) or "comfortable" spacing. */
  density?: "compact" | "comfortable";
  /** Shown when there's nothing to show. */
  fallback?: ReactNode;
  /** Link attributes: default opens in a new tab with noopener. */
  linkTarget?: "_blank" | "_self";
}

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");
const dataProps = (b: Block) => Object.fromEntries(Object.entries(blockData(b)).map(([k, v]) => [`data-${k}`, v]));

export function SynTextView({ value, className, style, theme = "inherit", density, fallback = null, linkTarget = "_blank" }: SynTextViewProps) {
  const doc = toDoc(value);
  if (!doc || !doc.blocks.some((b) => isAtom(b) || b.spans.some((s) => s.text.trim()))) return <>{fallback}</>;
  const markers = listMarkers(doc.blocks);
  return (
    <div className={cx("se-content", theme === "dark" && "se-dark", theme === "light" && "se-light", density === "comfortable" && "se-comfortable", className)} style={style}>
      {doc.blocks.map((b, i) => <BlockView key={i} block={b} marker={markers[i]} target={linkTarget} />)}
    </div>
  );
}

function BlockView({ block: b, marker, target }: { block: Block; marker: string | null; target: string }) {
  const cls = blockClass(b);
  const data = dataProps(b);
  switch (b.type) {
    case "hr": return <div className={cls}><hr /></div>;
    case "image":
    case "video": {
      const media = b.type === "image"
        ? <img src={b.src} alt={b.alt ?? ""} loading="lazy" decoding="async" />
        : <video src={b.src} controls preload="metadata" />;
      return (
        <div className={cls} {...data}>
          <figure className="se-figure" style={b.width ? { width: `${b.width}%` } : undefined}>
            {media}
            {b.caption && <figcaption className="se-caption">{b.caption}</figcaption>}
          </figure>
        </div>
      );
    }
    case "file":
      return (
        <div className={cls}>
          <a className="se-file-link" href={b.src} target="_blank" rel="noopener noreferrer" download>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><path d="M14 2v6h6" />
            </svg>
            <span className="se-file-name">{b.name || b.src}</span>
            {b.bytes !== undefined && <span className="se-file-size">{formatBytes(b.bytes)}</span>}
          </a>
        </div>
      );
    case "table": {
      const rows = b.rows ?? [];
      const head = b.head && rows.length ? rows[0] : null;
      const body = head ? rows.slice(1) : rows;
      const cell = (c: Cell, Tag: "td" | "th", key: number) => (
        <Tag key={key} data-align={c.align}>{c.spans.map((s, i) => <SpanView key={i} span={s} target={target} />)}</Tag>
      );
      return (
        <div className={cls}>
          <table className="se-table">
            {head && <thead><tr>{head.map((c, i) => cell(c, "th", i))}</tr></thead>}
            <tbody>{body.map((r, i) => <tr key={i}>{r.map((c, j) => cell(c, "td", j))}</tr>)}</tbody>
          </table>
        </div>
      );
    }
  }
  const Tag = b.type === "h1" || b.type === "h2" || b.type === "h3" || b.type === "h4" ? b.type
    : b.type === "quote" ? "blockquote" : b.type === "code" ? "pre" : "div";
  const list = b.list ? { role: "listitem", "data-marker": marker ?? "", ...(b.list === "check" ? { "aria-checked": !!b.checked } : {}) } : {};
  return (
    <Tag className={cls} {...data} {...list}>
      {b.spans.length ? b.spans.map((s, i) => <SpanView key={i} span={s} target={target} />) : <br />}
    </Tag>
  );
}

function SpanView({ span, target }: { span: Span; target: string }) {
  const { text, ...marks } = span;
  const inner = marks.script ? createElement(marks.script, null, text) : text;
  const cls = spanClass(marks) || undefined;
  const st = spanStyle(marks);
  const style = Object.keys(st).length ? st as CSSProperties : undefined;
  if (marks.link) return <a href={marks.link} target={target} rel="noopener noreferrer nofollow" className={cls} style={style}>{inner}</a>;
  return cls || style ? <span className={cls} style={style}>{inner}</span> : <>{inner}</>;
}

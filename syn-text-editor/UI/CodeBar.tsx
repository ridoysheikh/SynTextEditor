"use client";
// ─── The code bar ─────────────────────────────────────────────────────────────
// Over the header of the code block the caret is in (or the one under the pointer): the language, a file name, line
// numbers, wrapping and Copy. It lives inside the scrolling area, like the floating bar, so it scrolls with its block.

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Copy, FileCode2, ListOrdered, Search, WrapText } from "lucide-react";
import { blockLanguage, CODE_LANGUAGES, codeLanguage, type CodeLanguage } from "../core/code";
import type { SynTextEditor } from "../SynTextEditor";
import { Button, MenuItem, MenuSeparator, PopoverButton, ToolButton, overridable, useIsoLayoutEffect } from "./primitives";
import { useToolState } from "./toolbar/tools";

/** The block index of the code block under the pointer, if any. */
function useHovered(surface: HTMLElement | null): number | null {
  const [at, setAt] = useState<number | null>(null);
  useEffect(() => {
    if (!surface) return;
    const move = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.('[data-type="code"]');
      setAt(el && el.parentElement === surface ? Array.prototype.indexOf.call(surface.children, el) : null);
    };
    const leave = () => setAt(null);
    surface.addEventListener("mousemove", move);
    surface.addEventListener("mouseleave", leave);
    return () => { surface.removeEventListener("mousemove", move); surface.removeEventListener("mouseleave", leave); };
  }, [surface]);
  return at;
}

function LanguageMenu({ current, auto, offered, onPick }: { current?: string; auto: string; offered: readonly CodeLanguage[]; onPick: (id: string | undefined) => void }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? offered.filter((l) => [l.id, l.name, ...(l.aliases ?? [])].some((x) => x.toLowerCase().includes(n))) : offered;
  }, [q, offered]);
  return (
    <>
      <div className="se-code-search">
        <Search aria-hidden />
        <input className="se-input" data-autofocus autoFocus placeholder="Language" aria-label="Find a language" value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && shown[0]) { e.preventDefault(); onPick(shown[0].id); } }} />
      </div>
      {!q && (
        <>
          <MenuItem checked={!current} onSelect={() => onPick(undefined)}>
            Auto{auto !== "plain" ? ` · ${codeLanguage(auto)?.name ?? auto}` : ""}
          </MenuItem>
          <MenuSeparator />
        </>
      )}
      {shown.map((l) => <MenuItem key={l.id} checked={current === l.id} onSelect={() => onPick(l.id)}>{l.name}</MenuItem>)}
      {!shown.length && <div className="se-menu-label">No language matches</div>}
    </>
  );
}

function TitleForm({ value, onApply }: { value: string; onApply: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <form className="se-code-title" onSubmit={(e) => { e.preventDefault(); onApply(v); }}>
      <input className="se-input" autoFocus placeholder="e.g. src/app.ts" aria-label="File name" maxLength={80} value={v} onChange={(e) => setV(e.target.value)} />
      <Button tone="primary" size="sm" type="submit">Save</Button>
    </form>
  );
}

function CodeBarBase({ editor, surface, scroller }: { editor: SynTextEditor; surface: HTMLElement | null; scroller: HTMLElement | null }) {
  const { state } = useToolState(editor);
  const hovered = useHovered(surface);
  const bar = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pinned, setPinned] = useState<number | null>(null);    // a menu of this bar is open: keep it on its block
  const readOnly = editor.isReadOnly();
  const index = pinned ?? (state?.focused && state.code !== null ? state.code : hovered);
  const block = index !== null ? editor.getDoc().blocks[index] : undefined;
  const visible = block?.type === "code";

  useIsoLayoutEffect(() => {
    if (!visible || !surface || !scroller || index === null) { setPos(null); return; }
    const place = () => {
      const el = surface.children[index] as HTMLElement | undefined;
      if (!el || !bar.current) return;
      const t = el.getBoundingClientRect();
      const s = scroller.getBoundingClientRect();
      const head = parseFloat(getComputedStyle(el).getPropertyValue("--se-code-head-h")) || 30;
      const h = bar.current.offsetHeight;
      const w = bar.current.offsetWidth;
      const top = t.top - s.top + scroller.scrollTop + Math.max(0, (head - h) / 2);
      const left = Math.max(6, t.right - s.left + scroller.scrollLeft - w - 4);
      setPos({ top, left });
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(surface);
    return () => ro.disconnect();
  }, [visible, surface, scroller, index, block]);

  useEffect(() => { setCopied(false); }, [index]);
  if (!visible || !block || index === null) return null;
  const b = index;
  const offered = editor.config.code?.languages?.length
    ? editor.config.code.languages.map((id) => codeLanguage(id)).filter((l): l is CodeLanguage => !!l)
    : CODE_LANGUAGES;
  const auto = blockLanguage({ ...block, lang: undefined });
  const name = block.lang ? codeLanguage(block.lang)?.name ?? block.lang : auto !== "plain" ? `Auto · ${codeLanguage(auto)?.name}` : "Auto";
  const copy = async () => {
    if (await editor.copyCode(b)) { setCopied(true); setTimeout(() => setCopied(false), 1500); }
  };

  return (
    <div ref={bar} className="se-float se-codebar" role="toolbar" aria-label="Code block"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }} onMouseDown={(ev) => ev.preventDefault()}>
      {!readOnly && (
        <>
          <span onMouseDown={() => setPinned(b)}>
            <PopoverButton label="Language" wide panelClassName="se-code-langs" align="end"
              icon={<><span className="se-code-lang">{name}</span><ChevronDown className="se-caret" /></>}>
              {(close) => (
                <LanguageMenu current={block.lang} auto={auto} offered={offered}
                  onPick={(id) => { close(); setPinned(null); editor.setCode({ lang: id }, b); editor.focus(); }} />
              )}
            </PopoverButton>
          </span>
          <span onMouseDown={() => setPinned(b)}>
            <PopoverButton label="File name" icon={<FileCode2 />} active={!!block.title} align="end">
              {(close) => (
                <TitleForm value={block.title ?? ""} onApply={(v) => { close(); setPinned(null); editor.setCode({ title: v }, b); editor.focus(); }} />
              )}
            </PopoverButton>
          </span>
          <ToolButton label="Line numbers" active={block.lineNumbers !== false}
            onClick={() => editor.setCode({ lineNumbers: block.lineNumbers === false ? undefined : false }, b)}><ListOrdered /></ToolButton>
          <ToolButton label="Wrap long lines" active={!!block.lineWrap}
            onClick={() => editor.setCode({ lineWrap: block.lineWrap ? undefined : true }, b)}><WrapText /></ToolButton>
          <span className="se-sep" />
        </>
      )}
      <ToolButton label={copied ? "Copied" : "Copy code"} onClick={() => { void copy(); }}>{copied ? <Check /> : <Copy />}</ToolButton>
      {pinned !== null && <PinRelease onDone={() => setPinned(null)} />}
    </div>
  );
}

/** Lets go of the pinned block once its menu has closed (a click anywhere else). */
function PinRelease({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const up = (e: MouseEvent) => { if (!(e.target as Element).closest?.(".se-codebar, .se-layer")) onDone(); };
    document.addEventListener("mousedown", up, true);
    return () => document.removeEventListener("mousedown", up, true);
  }, [onDone]);
  return null;
}

/** Slot `CodeBar`. */
export const CodeBar = overridable("CodeBar", CodeBarBase);

"use client";
// ─── The floating bar ─────────────────────────────────────────────────────────
// Over a selected image, video, file, rule or table — and over a table while the caret is in a cell: the
// controls for that one thing. It lives inside the scrolling area, so it scrolls with what it points at.

import { useRef, useState, type ReactNode } from "react";
import {
  AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowDownToLine, ArrowLeftToLine, ArrowRightToLine, ArrowUp, ArrowUpToLine,
  ChevronDown, Columns3, Crop, Heading, Image as ImageIcon, Link2, Pencil, Replace, Rows3, Trash2, WrapText,
} from "lucide-react";
import type { Block } from "../core/model";
import type { SynTextEditor } from "../SynTextEditor";
import { MenuItem, MenuSeparator, PopoverButton, ToolButton, useIsoLayoutEffect, overridable } from "./primitives";
import { keys, useToolState } from "./toolbar/tools";

/** What the Size button shows: the width as set, or "Auto". */
const sizeLabel = (b: Block) => (b.w ? `${b.w}${b.h ? ` × ${b.h}` : ""}` : b.width ? `${b.width}%${b.h ? ` × ${b.h}` : ""}` : "Auto");

function FloatBarBase({ editor, surface, scroller }: { editor: SynTextEditor; surface: HTMLElement | null; scroller: HTMLElement | null }) {
  const { state } = useToolState(editor);
  const bar = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const index = state?.atom ?? state?.cell?.b ?? null;
  const block: Block | undefined = index !== null ? editor.getDoc().blocks[index] : undefined;
  const visible = !!block && !editor.isReadOnly() && !!state?.focused;

  useIsoLayoutEffect(() => {
    if (!visible || !surface || !scroller || index === null) { setPos(null); return; }
    const place = () => {
      const el = surface.children[index] as HTMLElement | undefined;
      const target = (el?.querySelector(".se-figure, .se-file-link, .se-table") as HTMLElement | null) ?? el;
      if (!target || !bar.current) return;
      const t = target.getBoundingClientRect();
      const s = scroller.getBoundingClientRect();
      const h = bar.current.offsetHeight;
      const w = bar.current.offsetWidth;
      let top = t.top - s.top + scroller.scrollTop - h - 8;
      if (top < scroller.scrollTop + 4) top = t.top - s.top + scroller.scrollTop + 8;     // no room above: inside the top
      let left = t.left - s.left + t.width / 2 - w / 2;
      left = Math.max(6, Math.min(left, scroller.clientWidth - w - 6));
      setPos({ top, left });
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(surface);
    return () => ro.disconnect();
  }, [visible, surface, scroller, index, block]);

  if (!visible || !block) return null;
  const b = index!;
  const e = editor.engine;
  const align = block.align ?? "center";
  const media = block.type === "image" || block.type === "video";
  const table = block.type === "table";

  let tools: ReactNode;
  if (table) {
    tools = (
      <>
        <PopoverButton label="Rows" icon={<><Rows3 /><ChevronDown className="se-caret" /></>} disabled={!state?.cell && state?.atom == null}>
          {(close) => (
            <>
              <MenuItem icon={<ArrowUpToLine />} onSelect={() => { close(); e?.addRow(0); }}>Insert row above</MenuItem>
              <MenuItem icon={<ArrowDownToLine />} onSelect={() => { close(); e?.addRow(1); }}>Insert row below</MenuItem>
              <MenuSeparator />
              <MenuItem icon={<Trash2 />} danger onSelect={() => { close(); e?.deleteRow(); }}>Delete row</MenuItem>
            </>
          )}
        </PopoverButton>
        <PopoverButton label="Columns" icon={<><Columns3 /><ChevronDown className="se-caret" /></>}>
          {(close) => (
            <>
              <MenuItem icon={<ArrowLeftToLine />} onSelect={() => { close(); e?.addCol(0); }}>Insert column left</MenuItem>
              <MenuItem icon={<ArrowRightToLine />} onSelect={() => { close(); e?.addCol(1); }}>Insert column right</MenuItem>
              <MenuSeparator />
              <MenuItem icon={<Trash2 />} danger onSelect={() => { close(); e?.deleteCol(); }}>Delete column</MenuItem>
            </>
          )}
        </PopoverButton>
        <ToolButton label="Header row" active={!!block.head} onClick={() => e?.toggleHeader()}><Heading /></ToolButton>
        <span className="se-sep" />
        <ToolButton label="Delete table" onClick={() => e?.deleteTable()}><Trash2 /></ToolButton>
      </>
    );
  } else {
    tools = (
      <>
        {media && (
          <>
            <ToolButton label="Align left" active={align === "left"} onClick={() => e?.updateAtom({ align: "left" }, b)}><AlignLeft /></ToolButton>
            <ToolButton label="Centre" active={align === "center"} onClick={() => e?.updateAtom({ align: undefined }, b)}><AlignCenter /></ToolButton>
            <ToolButton label="Align right" active={align === "right"} onClick={() => e?.updateAtom({ align: "right" }, b)}><AlignRight /></ToolButton>
            <PopoverButton label="Text wrap" active={!!block.wrap} icon={<><WrapText /><ChevronDown className="se-caret" /></>}>
              {(close) => (
                <>
                  <MenuItem checked={!block.wrap} onSelect={() => { close(); e?.updateAtom({ wrap: undefined }, b); }}>Break text — on its own line</MenuItem>
                  <MenuItem checked={!!block.wrap && align === "left"} onSelect={() => { close(); e?.updateAtom({ align: "left", wrap: true }, b); }}>Wrap text — media on the left</MenuItem>
                  <MenuItem checked={!!block.wrap && align === "right"} onSelect={() => { close(); e?.updateAtom({ align: "right", wrap: true }, b); }}>Wrap text — media on the right</MenuItem>
                </>
              )}
            </PopoverButton>
            <span className="se-sep" />
            <PopoverButton label="Size" wide icon={<><span className="se-btn-label">{sizeLabel(block)}</span><ChevronDown className="se-caret" /></>}>
              {(close) => (
                <>
                  <MenuItem checked={!block.w && !block.width && !block.h} onSelect={() => { close(); e?.updateAtom({ w: undefined, width: undefined, h: undefined }, b); }}>Original size</MenuItem>
                  <MenuSeparator />
                  {[25, 33, 50, 66, 75, 100].map((w) => (
                    <MenuItem key={w} checked={!block.w && !block.h && block.width === w}
                      onSelect={() => { close(); e?.updateAtom({ width: w }, b); }}>{w === 100 ? "Full width" : `${w}% of the width`}</MenuItem>
                  ))}
                  <MenuSeparator />
                  <MenuItem onSelect={() => { close(); editor.openMediaDetails(b); }}>Exact size…</MenuItem>
                </>
              )}
            </PopoverButton>
            {block.h !== undefined && (
              <PopoverButton label="Fit in the box" icon={<><Crop /><ChevronDown className="se-caret" /></>}>
                {(close) => (
                  <>
                    <MenuItem checked={!block.fit} onSelect={() => { close(); e?.updateAtom({ fit: undefined }, b); }}>Stretch to fill</MenuItem>
                    <MenuItem checked={block.fit === "contain"} onSelect={() => { close(); e?.updateAtom({ fit: "contain" }, b); }}>Fit inside — keep proportions</MenuItem>
                    <MenuItem checked={block.fit === "cover"} onSelect={() => { close(); e?.updateAtom({ fit: "cover" }, b); }}>Fill and crop</MenuItem>
                  </>
                )}
              </PopoverButton>
            )}
            {block.type === "image" && <ToolButton label="Link" kbd={keys("Ctrl+K")} active={!!block.link} onClick={() => editor.openLink()}><Link2 /></ToolButton>}
          </>
        )}
        {block.type !== "hr" && (
          <>
            <ToolButton label={block.type === "image" ? "Alt text and caption" : "Details"} onClick={() => editor.openMediaDetails(b)}><Pencil /></ToolButton>
            <ToolButton label="Replace" onClick={() => editor.openGallery(block.type as "image" | "video" | "file", b)}><Replace /></ToolButton>
            {block.type === "video" && <ToolButton label="Thumbnail" active={!!block.poster} onClick={() => editor.openMediaDetails(b)}><ImageIcon /></ToolButton>}
          </>
        )}
        <span className="se-sep" />
        <ToolButton label="Move up" disabled={b === 0} onClick={() => e?.moveAtom(-1, b)}><ArrowUp /></ToolButton>
        <ToolButton label="Move down" disabled={b >= editor.getDoc().blocks.length - 1} onClick={() => e?.moveAtom(1, b)}><ArrowDown /></ToolButton>
        <ToolButton label="Remove" kbd="Delete" onClick={() => e?.removeAtom(b)}><Trash2 /></ToolButton>
      </>
    );
  }
  return (
    <div ref={bar} className="se-float" role="toolbar" aria-label={table ? "Table" : "Media"}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }} onMouseDown={(ev) => ev.preventDefault()}>
      {tools}
    </div>
  );
}
export const FloatBar = overridable("FloatBar", FloatBarBase);

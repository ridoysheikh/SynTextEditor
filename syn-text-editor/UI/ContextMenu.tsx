"use client";
// ─── The right-click menu ─────────────────────────────────────────────────────
// Draws `editor.getUI().contextMenu`: rows, submenus that open on hover or →, and keyboard control (↑ ↓ → ←
// Enter Esc). It never takes focus from the editor, so the selection the menu acts on stays put.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronRight } from "lucide-react";
import type { ContextMenuContext, ContextMenuItem, SynTextEditor } from "../SynTextEditor";
import { Layer, cx, fitAxis, keep, revealRow, overridable } from "./primitives";
import { useUI } from "./toolbar/tools";

type Row = Exclude<ContextMenuItem, "separator">;
const usable = (it: ContextMenuItem | undefined): it is Row => !!it && it !== "separator" && !it.disabled;
const step = (items: ContextMenuItem[], from: number, dir: 1 | -1) => {
  for (let n = 1; n <= items.length; n++) {
    const i = (from + dir * n + items.length * 2) % items.length;
    if (usable(items[i])) return i;
  }
  return from;
};

function ContextMenuBase({ editor }: { editor: SynTextEditor }) {
  const ui = useUI(editor);
  const open = ui.contextMenu;
  return open ? <Menu key={`${open.ctx.x},${open.ctx.y}`} editor={editor} ctx={open.ctx} items={open.items} /> : null;
}

function Menu({ editor, ctx, items }: { editor: SynTextEditor; ctx: ContextMenuContext; items: ContextMenuItem[] }) {
  // path[level] = the highlighted row at each open level; a row's submenu is open when the path goes deeper.
  const [path, setPath] = useState<number[]>([-1]);
  const rows = useRef<Map<string, HTMLElement>>(new Map());
  const levels = [items];
  for (let l = 0; l < path.length - 1; l++) {
    const it = levels[l][path[l]];
    if (it && it !== "separator" && it.items) levels.push(it.items); else break;
  }

  const close = () => editor.closeContextMenu();
  const run = (it: Row, level: number, i: number) => {
    if (it.disabled) return;
    if (it.items) { setPath((p) => [...p.slice(0, level), i, step(it.items!, -1, 1)]); return; }
    close();
    it.onSelect?.(ctx);
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const L = levels.length - 1;
      const list = levels[L];
      const cur = path[L] ?? -1;
      const stop = () => { e.preventDefault(); e.stopPropagation(); };
      if (e.key === "Escape") { stop(); if (L > 0) setPath((p) => p.slice(0, L)); else close(); return; }
      if (e.key === "ArrowDown") { stop(); setPath((p) => [...p.slice(0, L), step(list, cur, 1)]); return; }
      if (e.key === "ArrowUp") { stop(); setPath((p) => [...p.slice(0, L), step(list, cur < 0 ? 0 : cur, -1)]); return; }
      if (e.key === "ArrowRight") { stop(); const it = list[cur]; if (usable(it) && it.items) run(it, L, cur); return; }
      if (e.key === "ArrowLeft") { stop(); if (L > 0) setPath((p) => p.slice(0, L)); return; }
      if (e.key === "Enter" || e.key === " ") { stop(); const it = list[cur]; if (usable(it)) run(it, L, cur); return; }
      if (e.key === "Tab") { stop(); return; }
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
        // A letter jumps to the next row starting with it.
        stop();
        const at = list.findIndex((it, i) => i > cur && usable(it) && it.label.toLowerCase().startsWith(e.key.toLowerCase()));
        const any = at >= 0 ? at : list.findIndex((it) => usable(it) && it.label.toLowerCase().startsWith(e.key.toLowerCase()));
        if (any >= 0) setPath((p) => [...p.slice(0, L), any]);
        return;
      }
      close();                       // anything else (a shortcut, typing) closes the menu and goes through
    };
    const down = (e: MouseEvent) => { if (!(e.target as Element).closest?.(".se-ctx")) close(); };
    const away = (e: Event) => {
      if (e.type === "scroll" && e.target instanceof Element && e.target.closest(".se-ctx")) return;   // the menu's own scroll
      close();
    };
    document.addEventListener("keydown", key, true);
    document.addEventListener("mousedown", down, true);
    window.addEventListener("resize", away);
    window.addEventListener("blur", away);
    window.addEventListener("scroll", away, true);
    return () => {
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("mousedown", down, true);
      window.removeEventListener("resize", away);
      window.removeEventListener("blur", away);
      window.removeEventListener("scroll", away, true);
    };
  });

  const layer = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    for (const panel of Array.from(layer.current?.querySelectorAll<HTMLElement>(".se-ctx") ?? [])) revealRow(panel, "[data-focus]");
  }, [path]);

  return (
    <Layer>
      <div ref={layer} style={{ display: "contents" }}>
      {levels.map((list, level) => {
        const anchor = level === 0 ? null : rows.current.get(`${level - 1}:${path[level - 1]}`) ?? null;
        return (
          <Panel key={level} level={level} x={ctx.x} y={ctx.y} anchor={anchor}>
            {list.map((it, i) => {
              if (it === "separator") return <div key={`s${i}`} className="se-menu-sep" role="separator" />;
              const on = path[level] === i;
              return (
                <button
                  key={`${it.id}${i}`}
                  ref={(el) => { if (el) rows.current.set(`${level}:${i}`, el); else rows.current.delete(`${level}:${i}`); }}
                  type="button"
                  role="menuitem"
                  aria-haspopup={it.items ? "menu" : undefined}
                  aria-expanded={it.items ? path.length > level + 1 && on : undefined}
                  aria-checked={it.checked}
                  aria-disabled={it.disabled || undefined}
                  disabled={it.disabled}
                  data-focus={on ? "" : undefined}
                  data-danger={it.danger ? "" : undefined}
                  className="se-menu-item"
                  onMouseDown={keep}
                  onMouseEnter={() => setPath((p) => (it.disabled ? [...p.slice(0, level), -1] : it.items ? [...p.slice(0, level), i, -1] : [...p.slice(0, level), i]))}
                  onClick={() => run(it, level, i)}
                >
                  <span className="se-ctx-icon" aria-hidden>{it.icon}</span>
                  <span className="se-ctx-label">{it.label}</span>
                  {it.checked && <Check className="se-ctx-check" aria-hidden />}
                  {it.kbd && <span className="se-menu-kbd">{it.kbd}</span>}
                  {it.items && <ChevronRight className="se-ctx-more" aria-hidden />}
                </button>
              );
            })}
          </Panel>
        );
      })}
      </div>
    </Layer>
  );
}

/** One level of the menu: at the pointer, or beside its parent row — flipped to stay on screen, scrolling when taller. */
function Panel({ level, x, y, anchor, children }: { level: number; x: number; y: number; anchor: HTMLElement | null; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; room: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.scrollHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (!anchor) {
      const left = x + w > vw - 4 ? Math.max(4, x - w) : x;
      const v = fitAxis(y, y, h, vh, 0, 4);
      setPos({ left, top: v.at, room: v.max });
    } else {
      const r = anchor.getBoundingClientRect();
      const left = r.right + w - 2 > vw - 4 ? Math.max(4, r.left - w + 2) : r.right - 2;
      const room = vh - 8;
      setPos({ left, top: Math.max(4, Math.min(r.top - 4, vh - Math.min(h, room) - 4)), room });
    }
  }, [x, y, anchor]);
  return (
    <div ref={ref} role="menu" className={cx("se-popover se-ctx", level > 0 && "se-ctx-sub")}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, ["--se-room" as string]: pos ? `${pos.room}px` : undefined }}
      onContextMenu={(e) => e.preventDefault()}>
      {children}
    </div>
  );
}
export const ContextMenu = overridable("ContextMenu", ContextMenuBase);

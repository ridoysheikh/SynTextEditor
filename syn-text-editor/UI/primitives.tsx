"use client";
// ─── UI primitives ────────────────────────────────────────────────────────────
// The button, popover, menu and modal every tool is built from. Exported so a host composing its own toolbar
// gets the same look without copying styles. Menus and dialogs are portalled to <body> inside a `.se-layer`
// carrying the editor's theme class and variables, so they theme with it and escape any overflow.

import { createContext, forwardRef, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type React from "react";

/** useLayoutEffect in the browser, useEffect on a server (where layout effects only warn). */
export const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** The theme a portalled layer copies from its editor; `anchor` is an element inside the editor. */
export const LayerContext = createContext<{ className: string; style: CSSProperties; anchor?: { current: HTMLElement | null } }>({ className: "", style: {} });

/**
 * Whether an element sits in a dark theme it inherits — a `.dark` ancestor (Tailwind's class strategy) with no
 * `.se-light` nearer to it.
 */
export function inheritsDark(el: HTMLElement | null | undefined): boolean {
  const dark = el?.closest(".dark, .se-dark");
  const light = el?.closest(".se-light, .light");
  return !!dark && (!light || dark.contains(light) === false);
}

/**
 * A portal into <body> that keeps the editor's theme — its theme class, its `vars`, and (for `theme: "inherit"`)
 * the darkness it inherits from where it sits, which a portal in <body> would otherwise lose.
 */
export function Layer({ children }: { children: ReactNode }) {
  const { className, style, anchor } = useContext(LayerContext);
  if (typeof document === "undefined") return null;
  const inherited = !/\bse-(dark|light|auto)\b/.test(className) && inheritsDark(anchor?.current) ? "se-dark" : "";
  return createPortal(<div className={cx("se-layer", className, inherited)} style={style}>{children}</div>, document.body);
}

/** Keeps the editor's selection when a toolbar control is clicked. */
export const keep = (e: React.MouseEvent) => { e.preventDefault(); };

// ── Tooltip ───────────────────────────────────────────────────────────────────
const TipContext = createContext<(tip: { text: string; kbd?: string; rect: DOMRect } | null) => void>(() => {});
export const TipProvider = TipContext.Provider;

/** Shows the tooltip a toolbar button asks for; one per editor. */
export function TooltipHost({ children }: { children: (show: (t: { text: string; kbd?: string; rect: DOMRect } | null) => void) => ReactNode }) {
  const [tip, setTip] = useState<{ text: string; kbd?: string; rect: DOMRect } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const show = (t: { text: string; kbd?: string; rect: DOMRect } | null) => {
    clearTimeout(timer.current);
    if (!t) { setTip(null); return; }
    timer.current = setTimeout(() => setTip(t), 350);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <TipProvider value={show}>
      {children(show)}
      {tip && (
        <Layer>
          <div className="se-tip" role="tooltip" style={{ left: Math.max(4, tip.rect.left + tip.rect.width / 2), top: tip.rect.bottom + 6, transform: "translateX(-50%)" }}>
            {tip.text}{tip.kbd && <kbd>{tip.kbd}</kbd>}
          </div>
        </Layer>
      )}
    </TipProvider>
  );
}

// ── Toolbar button ────────────────────────────────────────────────────────────
export interface ToolButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
  label: string;
  kbd?: string;
  active?: boolean;
  open?: boolean;
  wide?: boolean;
}
export const ToolButton = forwardRef<HTMLButtonElement, ToolButtonProps>(function ToolButton({ label, kbd, active, open, wide, children, className, onMouseEnter, onMouseLeave, ...rest }, ref) {
  const tip = useContext(TipContext);
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      data-open={open ? "" : undefined}
      data-wide={wide ? "" : undefined}
      className={cx("se-btn", className)}
      onMouseDown={keep}
      onMouseEnter={(e) => { tip({ text: label, kbd, rect: e.currentTarget.getBoundingClientRect() }); onMouseEnter?.(e); }}
      onMouseLeave={(e) => { tip(null); onMouseLeave?.(e); }}
      onClickCapture={() => tip(null)}
      {...rest}
    >{children}</button>
  );
});

export const Divider = () => <span className="se-sep" aria-hidden />;

// ── Popover ───────────────────────────────────────────────────────────────────
/**
 * Where a floating panel of natural height `h` goes beside the span [start, end] on an axis of length `size`:
 * after it if it fits, else before it if it fits, else on the roomier side — with `max`, the room it has there, so
 * the panel scrolls instead of leaving the screen.
 */
export function fitAxis(start: number, end: number, h: number, size: number, gap = 4, margin = 6): { at: number; max: number } {
  const after = size - end - gap - margin;
  const before = start - gap - margin;
  if (h <= after || after >= before) return { at: end + gap, max: Math.max(after, 0) };
  return { at: Math.max(margin, start - gap - Math.min(h, before)), max: before };
}

/** Scrolls the checked or highlighted row of a scrolling panel into view, without moving anything else. */
export function revealRow(panel: HTMLElement | null, sel = '[data-focus], [aria-checked="true"]') {
  const row = panel?.querySelector<HTMLElement>(sel);
  if (!panel || !row || panel.scrollHeight <= panel.clientHeight) return;
  const top = row.offsetTop;
  const bottom = top + row.offsetHeight;
  if (top < panel.scrollTop) panel.scrollTop = top - 4;
  else if (bottom > panel.scrollTop + panel.clientHeight) panel.scrollTop = bottom - panel.clientHeight + 4;
}

/**
 * A floating panel under `anchor`, flipped above when there's no room, kept on screen — and never taller or wider
 * than the room it has (`--se-popover-max-h` / `--se-popover-max-w` cap it; past that it scrolls). Closes on
 * Escape, on a click outside, and when the editor scrolls away.
 */
export function Popover({ anchor, open, onClose, children, align = "start", className, style, role = "dialog", label }: {
  anchor: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: "start" | "end" | "center";
  className?: string;
  style?: CSSProperties;
  role?: string;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; room: number } | null>(null);
  const first = useRef(true);

  useIsoLayoutEffect(() => {
    if (!open || !anchor) { setPos(null); first.current = true; return; }
    const place = (e?: Event) => {
      const el = ref.current;
      if (e?.type === "scroll" && el && e.target instanceof Node && el.contains(e.target)) return;   // its own scroll
      const a = anchor.getBoundingClientRect();
      const w = el?.offsetWidth ?? 200;
      const h = el?.scrollHeight ?? 200;
      let left = align === "end" ? a.right - w : align === "center" ? a.left + a.width / 2 - w / 2 : a.left;
      left = Math.max(6, Math.min(left, window.innerWidth - w - 6));
      const y = fitAxis(a.top, a.bottom, h, window.innerHeight);
      setPos({ left, top: y.at, room: y.max });
    };
    place();
    const raf = requestAnimationFrame(() => {
      place();
      if (first.current) { first.current = false; revealRow(ref.current); }
    });
    // Content that grows (a section opening) re-fits the panel.
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => place());
    for (const child of Array.from(ref.current?.children ?? [])) ro?.observe(child);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, anchor, align]);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor?.contains(t)) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("mousedown", down, true);
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("mousedown", down, true); document.removeEventListener("keydown", key, true); };
  }, [open, anchor, onClose]);

  if (!open) return null;
  return (
    <Layer>
      <div ref={ref} role={role} aria-label={label} className={cx("se-popover", className)}
        style={{ ...style, left: pos?.left ?? -9999, top: pos?.top ?? -9999, ["--se-room" as string]: pos ? `${pos.room}px` : undefined }}>
        {children}
      </div>
    </Layer>
  );
}

/** A toolbar button that opens a popover — the state, the anchor and the wiring in one. */
export function PopoverButton({ label, kbd, icon, active, disabled, wide, children, align, panelClassName, buttonClassName, style }: {
  label: string;
  kbd?: string;
  icon: ReactNode;
  active?: boolean;
  disabled?: boolean;
  wide?: boolean;
  align?: "start" | "end" | "center";
  panelClassName?: string;
  buttonClassName?: string;
  style?: CSSProperties;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const close = () => setOpen(false);
  return (
    <>
      <ToolButton ref={btn} label={label} kbd={kbd} active={active} open={open} disabled={disabled} wide={wide}
        aria-haspopup="true" aria-expanded={open} className={buttonClassName} style={style} onClick={() => setOpen((o) => !o)}>
        {icon}
      </ToolButton>
      <Popover anchor={btn.current} open={open} onClose={close} align={align} className={panelClassName} label={label}>
        {children(close)}
      </Popover>
    </>
  );
}

export function MenuItem({ children, icon, checked, danger, kbd, onSelect, disabled, style }: {
  children: ReactNode;
  icon?: ReactNode;
  checked?: boolean;
  danger?: boolean;
  kbd?: string;
  disabled?: boolean;
  style?: CSSProperties;
  onSelect: () => void;
}) {
  return (
    <button type="button" role="menuitemradio" aria-checked={checked} data-danger={danger ? "" : undefined} disabled={disabled}
      className="se-menu-item" style={style} onMouseDown={keep} onClick={onSelect}>
      {icon}<span className="se-menu-text">{children}</span>{kbd && <span className="se-menu-kbd">{kbd}</span>}
    </button>
  );
}
export const MenuSeparator = () => <div className="se-menu-sep" role="separator" />;
export const MenuLabel = ({ children }: { children: ReactNode }) => <div className="se-menu-label">{children}</div>;

// ── Modal ─────────────────────────────────────────────────────────────────────
export function Modal({ title, onClose, children, footer, width = 520, label, headExtra }: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  label?: string;
  headExtra?: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const q = (s: string) => box.current?.querySelector<HTMLElement>(s);
    (q("[data-autofocus]") ?? q("input:not([type=hidden]):not([hidden]), textarea, select") ?? q(".se-modal-body button") ?? q("[data-close]"))?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      if (e.key === "Tab" && box.current) {                     // keep Tab inside the dialog
        const f = Array.from(box.current.querySelectorAll<HTMLElement>("button:not(:disabled), input, textarea, select, [tabindex]:not([tabindex='-1'])"));
        if (!f.length) return;
        const i = f.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("keydown", key, true);
      // An editor restores its own caret (editor.closeModal); a bare focus() here would move it to the start.
      if (!prev?.closest?.(".se-surface")) prev?.focus?.({ preventScroll: true });
    };
  }, [onClose]);
  return (
    <Layer>
      <div className="se-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div ref={box} role="dialog" aria-modal="true" aria-label={label ?? (typeof title === "string" ? title : undefined)} className="se-modal" style={{ maxWidth: width }}>
          <div className="se-modal-head">
            <h2 className="se-modal-title">{title}</h2>
            {headExtra}
            <button type="button" className="se-btn" aria-label="Close" data-close onClick={onClose}><X /></button>
          </div>
          {children}
          {footer && <div className="se-modal-foot">{footer}</div>}
        </div>
      </div>
    </Layer>
  );
}

export function Button({ tone, size, children, className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "danger" | "ghost"; size?: "sm" }) {
  return <button type="button" data-tone={tone} data-size={size} className={cx("se-button", className)} {...rest}>{children}</button>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="se-field"><span>{label}</span>{children}</label>;
}

// ── Slider ────────────────────────────────────────────────────────────────────
/**
 * A range control drawn by the library (no native `<input type="range">`): drag, click the track, or use the keys —
 * ← → ↑ ↓ step, Page Up / Down ten steps, Home / End the ends. `track` paints the track (e.g. a hue gradient).
 */
export function Slider({ value, min = 0, max = 100, step = 1, onChange, label, valueText, track, className, style }: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  label: string;
  valueText?: string;
  track?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const snap = (v: number) => Math.min(max, Math.max(min, Math.round((v - min) / step) * step + min));
  const at = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    return snap(min + ((clientX - r.left) / Math.max(r.width, 1)) * (max - min));
  };
  const pct = ((value - min) / (max - min || 1)) * 100;
  return (
    <div ref={ref} role="slider" tabIndex={0} aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value}
      aria-valuetext={valueText} className={cx("se-slider", className)} data-track={track ? "" : undefined}
      style={{ ...style, ["--se-slider-pct" as string]: `${pct}%`, ...(track ? { ["--se-slider-track" as string]: track } : {}) }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.focus({ preventScroll: true });
        e.currentTarget.setPointerCapture(e.pointerId);
        onChange(at(e.clientX));
      }}
      onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) onChange(at(e.clientX)); }}
      onKeyDown={(e) => {
        const big = step * 10;
        const next = e.key === "ArrowRight" || e.key === "ArrowUp" ? value + step
          : e.key === "ArrowLeft" || e.key === "ArrowDown" ? value - step
          : e.key === "PageUp" ? value + big : e.key === "PageDown" ? value - big
          : e.key === "Home" ? min : e.key === "End" ? max : null;
        if (next === null) return;
        e.preventDefault();
        e.stopPropagation();
        onChange(snap(next));
      }}>
      <span className="se-slider-track"><span className="se-slider-fill" /></span>
      <span className="se-slider-thumb" />
    </div>
  );
}

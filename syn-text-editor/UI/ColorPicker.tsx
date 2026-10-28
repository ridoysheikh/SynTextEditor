"use client";
// ─── Colour picker ────────────────────────────────────────────────────────────
// Drawn by the library, never the browser's `<input type="color">`, so it looks the same everywhere and themes
// with the editor: a saturation × brightness square, a hue slider, and a hex field. Pointer, touch and keys
// (arrows; Shift for bigger steps; Enter applies).

import { useEffect, useRef, useState } from "react";
import { Slider, overridable } from "./primitives";

export interface HSV { h: number; s: number; v: number }

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** "#abc", "abc", "#aabbcc" → "#aabbcc"; anything else → null. */
export function normalizeHex(input: string): string | null {
  const m = HEX.exec(input.trim());
  if (!m) return null;
  const h = m[1].toLowerCase();
  return `#${h.length === 3 ? h.split("").map((c) => c + c).join("") : h}`;
}

export function hexToHsv(hex: string): HSV {
  const n = parseInt((normalizeHex(hex) ?? "#000000").slice(1), 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  const h = d === 0 ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? (d / max) * 100 : 0, v: max * 100 };
}

export function hsvToHex({ h, s, v }: HSV): string {
  const f = (k: number) => {
    const x = (k + h / 60) % 6;
    const c = (v / 100) * (1 - (s / 100) * Math.max(0, Math.min(x, 4 - x, 1)));
    return Math.round(c * 255).toString(16).padStart(2, "0");
  };
  return `#${f(5)}${f(3)}${f(1)}`;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** The picker itself — `onApply` gets a "#rrggbb" when the user confirms. */
function ColorPickerBase({ initial, onApply, applyLabel = "Apply" }: { initial?: string; onApply: (hex: string) => void; applyLabel?: string }) {
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(initial ?? "#2f6bff"));
  const hex = hsvToHex(hsv);
  const [draft, setDraft] = useState<string | null>(null);
  const area = useRef<HTMLDivElement>(null);
  useEffect(() => setDraft(null), [hex]);

  const fromPoint = (x: number, y: number) => {
    const r = area.current!.getBoundingClientRect();
    setHsv((c) => ({ ...c, s: clamp(((x - r.left) / r.width) * 100, 0, 100), v: clamp(100 - ((y - r.top) / r.height) * 100, 0, 100) }));
  };
  const typed = draft === null ? null : normalizeHex(draft);

  return (
    <div className="se-picker">
      <div ref={area} className="se-sv" role="slider" tabIndex={0} aria-label="Saturation and brightness"
        aria-valuetext={`saturation ${Math.round(hsv.s)}%, brightness ${Math.round(hsv.v)}%`}
        style={{ ["--se-sv-hue" as string]: `hsl(${hsv.h} 100% 50%)` }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.currentTarget.focus({ preventScroll: true });
          e.currentTarget.setPointerCapture(e.pointerId);
          fromPoint(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPoint(e.clientX, e.clientY); }}
        onKeyDown={(e) => {
          const d = e.shiftKey ? 10 : 2;
          const ds = e.key === "ArrowRight" ? d : e.key === "ArrowLeft" ? -d : 0;
          const dv = e.key === "ArrowUp" ? d : e.key === "ArrowDown" ? -d : 0;
          if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); onApply(hex); return; }
          if (!ds && !dv) return;
          e.preventDefault();
          e.stopPropagation();
          setHsv((c) => ({ ...c, s: clamp(c.s + ds, 0, 100), v: clamp(c.v + dv, 0, 100) }));
        }}>
        <span className="se-sv-thumb" style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%`, background: hex }} />
      </div>
      <Slider label="Hue" min={0} max={359} value={hsv.h} valueText={`${Math.round(hsv.h)}°`} onChange={(h) => setHsv((c) => ({ ...c, h }))}
        track="linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)" />
      <div className="se-picker-row">
        <span className="se-picker-chip" style={{ background: typed ?? hex }} aria-hidden />
        <input className="se-input" aria-label="Hex colour" spellCheck={false} maxLength={7} value={draft ?? hex}
          aria-invalid={draft !== null && !typed}
          onChange={(e) => {
            setDraft(e.target.value);
            const h = normalizeHex(e.target.value);
            if (h && e.target.value.replace("#", "").length === 6) setHsv(hexToHsv(h));
          }}
          onBlur={() => { if (typed) setHsv(hexToHsv(typed)); setDraft(null); }}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            e.stopPropagation();
            if (draft === null || typed) onApply(typed ?? hex);
          }} />
        <button type="button" className="se-button" data-size="sm" data-tone="primary" disabled={draft !== null && !typed}
          onMouseDown={(e) => e.preventDefault()} onClick={() => onApply(typed ?? hex)}>{applyLabel}</button>
      </div>
    </div>
  );
}

/** Slot `ColorPicker`. */
export const ColorPicker = overridable("ColorPicker", ColorPickerBase);

/** Custom colours used lately, newest first — shared by every editor on the page. */
const recent: string[] = [];
export const recentColors = () => recent.slice();
export function rememberColor(hex: string) {
  const i = recent.indexOf(hex);
  if (i >= 0) recent.splice(i, 1);
  recent.unshift(hex);
  recent.length = Math.min(recent.length, 9);
}

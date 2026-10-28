/**
 * How the model looks, shared by the editor's surface, the viewer and `toHTML`, so what is typed is exactly what
 * is shown. Toggles are `se-*` classes (layout.css); sizes, fonts and colours are inline styles whose palette
 * colours read `--se-c-*` / `--se-hl-*` variables, so a theme recolours stored documents too.
 */
import { BLOCK_SIZE, type Block, type Marks } from "./model";

export interface Swatch { name: string; label: string; hex: string }

/** Text colours. The hex is the light-theme value and the fallback in exported HTML; themes override the variable. */
export const COLORS: Swatch[] = [
  { name: "gray", label: "Gray", hex: "#6b7280" }, { name: "red", label: "Red", hex: "#e03131" },
  { name: "orange", label: "Orange", hex: "#e8590c" }, { name: "yellow", label: "Yellow", hex: "#e67700" },
  { name: "green", label: "Green", hex: "#2f9e44" }, { name: "teal", label: "Teal", hex: "#0c8599" },
  { name: "blue", label: "Blue", hex: "#1c7ed6" }, { name: "purple", label: "Purple", hex: "#7048e8" },
  { name: "pink", label: "Pink", hex: "#d6336c" },
];
export const HIGHLIGHTS: Swatch[] = [
  { name: "yellow", label: "Yellow", hex: "#fff3bf" }, { name: "green", label: "Green", hex: "#d3f9d8" },
  { name: "teal", label: "Teal", hex: "#c3fae8" }, { name: "blue", label: "Blue", hex: "#d0ebff" },
  { name: "purple", label: "Purple", hex: "#e5dbff" }, { name: "pink", label: "Pink", hex: "#ffdeeb" },
  { name: "red", label: "Red", hex: "#ffe3e3" }, { name: "orange", label: "Orange", hex: "#ffe8cc" },
  { name: "gray", label: "Gray", hex: "#e9ecef" },
];
const COLOR_HEX = Object.fromEntries(COLORS.map((s) => [s.name, s.hex]));
const HIGHLIGHT_HEX = Object.fromEntries(HIGHLIGHTS.map((s) => [s.name, s.hex]));

export interface FontOption { label: string; value: string }
export const FONTS: FontOption[] = [
  { label: "Sans", value: "Inter, system-ui, sans-serif" },
  { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Mono", value: "'JetBrains Mono', ui-monospace, monospace" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Times", value: "'Times New Roman', Times, serif" },
  { label: "Courier", value: "'Courier New', Courier, monospace" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
];
export const SIZES = [10, 11, 12, 13, 14, 15, 16, 18, 20, 24, 28, 32, 36, 48, 64];

/** A palette name → its variable (with the light hex as fallback); a hex stays itself. `inline` resolves to the hex. */
export function colorValue(c: string, kind: "color" | "highlight", inline = false): string {
  if (c.startsWith("#")) return c;
  const hex = (kind === "color" ? COLOR_HEX : HIGHLIGHT_HEX)[c];
  if (inline) return hex ?? "inherit";
  const v = `--se-${kind === "color" ? "c" : "hl"}-${c}`;
  return hex ? `var(${v}, ${hex})` : `var(${v})`;
}

/** The classes on a span's element (formats that are pure style rules). */
export function spanClass(m: Marks): string {
  const c: string[] = [];
  if (m.bold) c.push("se-b");
  if (m.italic) c.push("se-i");
  if (m.underline) c.push("se-u");
  if (m.strike) c.push("se-s");
  if (m.code) c.push("se-icode");
  if (m.link) c.push("se-link");
  if (m.highlight) c.push("se-hl");
  return c.join(" ");
}

/** The inline style on a span's element (formats with a value), camelCase. `inline` writes self-contained values. */
export function spanStyle(m: Marks, inline = false): Record<string, string> {
  const s: Record<string, string> = {};
  if (m.size) s.fontSize = `${m.size}px`;
  if (m.font) s.fontFamily = m.font;
  if (m.color) s.color = colorValue(m.color, "color", inline);
  if (m.highlight) s.backgroundColor = colorValue(m.highlight, "highlight", inline);
  if (inline) {
    if (m.bold) s.fontWeight = "700";
    if (m.italic) s.fontStyle = "italic";
    const deco = [(m.underline || m.link) && "underline", m.strike && "line-through"].filter(Boolean).join(" ");
    if (deco) s.textDecoration = deco;
    if (m.code) { s.fontFamily = s.fontFamily ?? "ui-monospace, monospace"; s.fontSize = s.fontSize ?? "0.9em"; }
  }
  return s;
}

export const cssText = (style: Record<string, string>) =>
  Object.entries(style).map(([k, v]) => `${k.replace(/[A-Z]/g, (x) => `-${x.toLowerCase()}`)}:${v}`).join(";");

/** The block element's class; everything else that varies is a data attribute layout.css reads. */
export const blockClass = (b: Block) => `se-blk se-${b.type}${b.list ? ` se-li se-li-${b.list}` : ""}`;

/** The data attributes a block element carries (align, list depth, checked). */
export function blockData(b: Block): Record<string, string> {
  const d: Record<string, string> = {};
  if (b.align) d.align = b.align;
  if (b.list) d.indent = String(b.indent ?? 0);
  if (b.list === "check" && b.checked) d.checked = "";
  return d;
}

const BULLETS = ["•", "◦", "▪"];
/** The marker each list item shows: bullets by depth, numbers counted per depth (restarting after other blocks). */
export function listMarkers(blocks: Block[]): (string | null)[] {
  const n: number[] = [];
  return blocks.map((b) => {
    if (!b.list) { n.length = 0; return null; }
    const d = b.indent ?? 0;
    n.length = d + 1;
    if (b.list === "ordered") {
      n[d] = (n[d] ?? 0) + 1;
      const k = n[d];
      return d % 3 === 1 ? `${alpha(k)}.` : d % 3 === 2 ? `${roman(k)}.` : `${k}.`;
    }
    n[d] = 0;
    return b.list === "check" ? "" : BULLETS[d % BULLETS.length];
  });
}
const alpha = (n: number): string => (n <= 0 ? "" : alpha(Math.floor((n - 1) / 26)) + String.fromCharCode(97 + ((n - 1) % 26)));
function roman(n: number): string {
  const t: [number, string][] = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
  let s = "";
  for (const [v, r] of t) while (n >= v) { s += r; n -= v; }
  return s;
}

export const baseSize = (b: Block | undefined) => BLOCK_SIZE[b?.type ?? "p"];

export function formatBytes(n: number | undefined): string {
  if (n === undefined) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

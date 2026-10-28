"use client";
// ─── Toolbar tools ────────────────────────────────────────────────────────────
// Every control on the toolbar, each standalone: `<BoldTool editor={editor} />` works in a toolbar of the host's
// own. They read the editor's state through `useToolState` and act through the instance.

import { createElement, useContext, useState, type CSSProperties, type ReactNode } from "react";
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Baseline, Bold, Check, ChevronDown, Code, Code2, Eraser, Expand, Eye, File,
  Film, Highlighter, Image as ImageIcon, IndentDecrease, IndentIncrease, Italic, Link2, List, ListChecks, ListOrdered, Minus,
  Paintbrush, Pipette, Plus, Quote, Redo2, Search, Shrink, Strikethrough, Subscript, Superscript, Table, Underline, Undo2, Images,
} from "lucide-react";
import { BLOCK_LABEL, BLOCK_SIZE, SIZE_MAX, SIZE_MIN, type Align, type TextType, type Toggle } from "../../core/model";
import { colorValue } from "../../core/styles";
import { ColorPicker, recentColors, rememberColor } from "../ColorPicker";
import type { EditorState } from "../../editor/engine";
import { useEditorValue } from "../../hooks";
import type { SynTextEditor, UIState } from "../../SynTextEditor";
import { ComponentsContext, keep, MenuItem, MenuLabel, MenuSeparator, overridable, PopoverButton, ToolButton } from "../primitives";
import type { ColorMenuProps, ToolProps } from "../slots";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
/** A shortcut as this platform writes it. */
export const keys = (k: string) => (isMac ? k.replace(/Ctrl\+/g, "⌘").replace(/Alt\+/g, "⌥").replace(/Shift\+/g, "⇧") : k);

/** The engine's state (null until mounted) and whether the editor can be edited. */
export function useToolState(editor: SynTextEditor): { state: EditorState | null; off: boolean } {
  const state = useEditorValue(editor, ["state", "ui"], (e) => e.getState());
  const ro = useEditorValue(editor, ["ui"], (e) => e.isReadOnly());
  return { state, off: !state || ro };
}
export function useUI(editor: SynTextEditor): UIState {
  return useEditorValue(editor, ["ui"], (e) => e.getUI());
}
export type { ToolProps };

// ── history ───────────────────────────────────────────────────────────────────
export function UndoTool({ editor }: ToolProps) {
  const { state, off } = useToolState(editor);
  return <ToolButton label="Undo" kbd={keys("Ctrl+Z")} disabled={off || !state?.canUndo} onClick={() => editor.undo()}><Undo2 /></ToolButton>;
}
export function RedoTool({ editor }: ToolProps) {
  const { state, off } = useToolState(editor);
  return <ToolButton label="Redo" kbd={keys("Ctrl+Shift+Z")} disabled={off || !state?.canRedo} onClick={() => editor.redo()}><Redo2 /></ToolButton>;
}

// ── marks ─────────────────────────────────────────────────────────────────────
const MARKS: Record<Toggle, { label: string; kbd: string; Icon: typeof Bold }> = {
  bold: { label: "Bold", kbd: "Ctrl+B", Icon: Bold },
  italic: { label: "Italic", kbd: "Ctrl+I", Icon: Italic },
  underline: { label: "Underline", kbd: "Ctrl+U", Icon: Underline },
  strike: { label: "Strikethrough", kbd: "Ctrl+Shift+X", Icon: Strikethrough },
  code: { label: "Inline code", kbd: "Ctrl+E", Icon: Code },
};
export function MarkTool({ editor, mark }: ToolProps & { mark: Toggle }) {
  const { state, off } = useToolState(editor);
  const { label, kbd, Icon } = MARKS[mark];
  return <ToolButton label={label} kbd={keys(kbd)} active={!!state?.active.marks[mark]} disabled={off} onClick={() => editor.toggle(mark)}><Icon /></ToolButton>;
}
export function ScriptTool({ editor, script }: ToolProps & { script: "sub" | "sup" }) {
  const { state, off } = useToolState(editor);
  return (
    <ToolButton label={script === "sup" ? "Superscript" : "Subscript"} kbd={keys(script === "sup" ? "Ctrl+." : "Ctrl+,")}
      active={state?.active.marks.script === script} disabled={off} onClick={() => editor.setScript(script)}>
      {script === "sup" ? <Superscript /> : <Subscript />}
    </ToolButton>
  );
}

// ── block style ───────────────────────────────────────────────────────────────
const BLOCK_PREVIEW: Record<TextType, CSSProperties> = {
  p: {}, h1: { fontSize: 20, fontWeight: 700 }, h2: { fontSize: 17, fontWeight: 700 }, h3: { fontSize: 15, fontWeight: 600 },
  h4: { fontSize: 13.5, fontWeight: 600 }, quote: { fontStyle: "italic" }, code: { fontFamily: "var(--se-font-mono)", fontSize: 12 },
};
export function BlockTool({ editor }: ToolProps) {
  const { state, off } = useToolState(editor);
  const types = (Object.keys(BLOCK_LABEL) as TextType[]).filter((t) => editor.schema.has(t));
  const cur = state?.active.block;
  return (
    <PopoverButton label="Text style" wide disabled={off || !!state?.cell || state?.atom !== null}
      style={{ width: 104 }}
      icon={<><span className="se-btn-label" style={{ flex: 1 }}>{cur ? BLOCK_LABEL[cur] : "Mixed"}</span><ChevronDown className="se-caret" /></>}>
      {(close) => types.map((t) => (
        <MenuItem key={t} checked={cur === t} kbd={["p", "h1", "h2", "h3", "h4"].includes(t) ? keys(`Ctrl+Alt+${t === "p" ? 0 : t[1]}`) : undefined}
          onSelect={() => { close(); editor.setBlock(t); }}>
          <span style={BLOCK_PREVIEW[t]}>{BLOCK_LABEL[t]}</span>
        </MenuItem>
      ))}
    </PopoverButton>
  );
}
export function BlockToggleTool({ editor, type }: ToolProps & { type: "quote" | "code" }) {
  const { state, off } = useToolState(editor);
  const on = state?.active.block === type;
  return (
    <ToolButton label={type === "quote" ? "Quote" : "Code block"} active={on} disabled={off || !!state?.cell}
      onClick={() => editor.setBlock(on ? "p" : type)}>
      {type === "quote" ? <Quote /> : <Code2 />}
    </ToolButton>
  );
}

// ── font & size ───────────────────────────────────────────────────────────────
export function FontTool({ editor }: ToolProps) {
  const { state, off } = useToolState(editor);
  const { fonts } = editor.palette;
  const cur = state?.active.marks.font;
  const name = cur ? fonts.find((f) => f.value === cur)?.label ?? cur.split(",")[0].replace(/['"]/g, "") : "Default";
  return (
    <PopoverButton label="Font" wide disabled={off} style={{ width: 86 }}
      icon={<><span className="se-btn-label" style={{ flex: 1, fontFamily: cur }}>{name}</span><ChevronDown className="se-caret" /></>}>
      {(close) => (
        <>
          <MenuItem checked={!cur} onSelect={() => { close(); editor.setFont(null); }}>Default</MenuItem>
          <MenuSeparator />
          {fonts.map((f) => (
            <MenuItem key={f.value} checked={cur === f.value} style={{ fontFamily: f.value }} onSelect={() => { close(); editor.setFont(f.value); }}>{f.label}</MenuItem>
          ))}
        </>
      )}
    </PopoverButton>
  );
}

export function SizeTool({ editor }: ToolProps) {
  const { state, off } = useToolState(editor);
  const [draft, setDraft] = useState<string | null>(null);
  const size = state?.active.size;
  const { sizes } = editor.palette;
  return (
    <span className="se-tb-group" style={{ gap: 1 }}>
      <ToolButton label="Smaller" kbd={keys("Ctrl+Shift+,")} disabled={off} onClick={() => editor.engine?.stepSize(-1)} style={{ minWidth: 22, padding: 0 }}><Minus /></ToolButton>
      <input
        className="se-size-input" type="text" inputMode="numeric" role="spinbutton" aria-label="Font size (px)" disabled={off}
        aria-valuemin={SIZE_MIN} aria-valuemax={SIZE_MAX} aria-valuenow={size ?? undefined} maxLength={2} autoComplete="off" spellCheck={false}
        placeholder="—" value={draft ?? (size ? String(size) : "")}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "");
          setDraft(v);
          const n = Number(v);
          if (v && n >= SIZE_MIN && n <= SIZE_MAX) editor.engine?.setSize(n, false);
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); setDraft(null); editor.focus(); }
          else if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); setDraft(null); editor.engine?.stepSize(e.key === "ArrowUp" ? 1 : -1); }
        }}
      />
      <PopoverButton label="Sizes" icon={<ChevronDown className="se-caret" />} disabled={off} buttonClassName="se-btn-narrow" style={{ minWidth: 18, padding: 0 }}>
        {(close) => (
          <>
            <MenuItem checked={false} onSelect={() => { close(); editor.setSize(null); }}>Default ({editor.engine?.baseSize(state?.active.block ?? "p") ?? BLOCK_SIZE[state?.active.block ?? "p"]})</MenuItem>
            <MenuSeparator />
            {sizes.map((s) => <MenuItem key={s} checked={size === s} onSelect={() => { close(); editor.setSize(s); }}>{s}</MenuItem>)}
          </>
        )}
      </PopoverButton>
      <ToolButton label="Bigger" kbd={keys("Ctrl+Shift+.")} disabled={off} onClick={() => editor.engine?.stepSize(1)} style={{ minWidth: 22, padding: 0 }}><Plus /></ToolButton>
    </span>
  );
}

// ── colour ────────────────────────────────────────────────────────────────────
export function ColorTool({ editor, kind }: ToolProps & { kind: "color" | "highlight" }) {
  const { state, off } = useToolState(editor);
  const { colors, highlights } = editor.palette;
  const list = kind === "color" ? colors : highlights;
  const cur = state?.active.marks[kind];
  const set = (c: string | null) => (kind === "color" ? editor.setColor(c) : editor.setHighlight(c));
  const bar = cur ? colorValue(cur, kind) : kind === "color" ? "var(--se-text)" : "transparent";
  const title = kind === "color" ? "Text colour" : "Highlight";
  return (
    <PopoverButton label={title} disabled={off}
      icon={<>{kind === "color" ? <Baseline /> : <Highlighter />}<span className="se-swatch-bar" style={{ background: bar, outline: !cur && kind === "highlight" ? "1px dashed var(--se-muted)" : undefined }} /></>}>
      {(close) => <ColorMenu kind={kind} title={title} list={list} cur={cur} onPick={(c) => { close(); set(c); }} />}
    </PopoverButton>
  );
}

function ColorMenuBase({ kind, title, list, cur, onPick }: ColorMenuProps) {
  const [hover, setHover] = useState<string | null>(null);
  const [custom, setCustom] = useState(false);
  const recent = recentColors();
  const swatch = (key: string, value: string, label: string) => (
    <button key={key} type="button" className="se-swatch" aria-label={label} aria-pressed={cur === value}
      style={{ background: colorValue(value, kind) }} onMouseDown={keep}
      onMouseEnter={() => setHover(label)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(label)} onBlur={() => setHover(null)}
      onClick={() => onPick(value)}>
      {cur === value && <Check color={kind === "color" ? "#fff" : "var(--se-text)"} />}
    </button>
  );
  const none = kind === "color" ? "Default" : "None";
  return (
    <div className="se-colors">
      <div className="se-menu-label">{title}<span className="se-colors-hover" aria-hidden>{hover}</span></div>
      <div className="se-swatches" role="group" aria-label={title}>
        <button type="button" className="se-swatch" data-none aria-label={none} aria-pressed={!cur} onMouseDown={keep}
          onMouseEnter={() => setHover(none)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(none)} onBlur={() => setHover(null)}
          onClick={() => onPick(null)} />
        {list.map((s) => swatch(s.name, s.name, s.label))}
      </div>
      {recent.length > 0 && (
        <>
          <div className="se-menu-label">Recent</div>
          <div className="se-swatches se-swatch-recent" role="group" aria-label="Recent colours">
            {recent.map((h) => swatch(`r${h}`, h, h))}
          </div>
        </>
      )}
      <MenuSeparator />
      {custom
        ? <ColorPicker initial={cur?.startsWith("#") ? cur : recent[0]} onApply={(h) => { rememberColor(h); onPick(h); }} />
        : (
          <button type="button" className="se-menu-item" aria-expanded={false} onMouseDown={keep} onClick={() => setCustom(true)}>
            <Pipette /><span className="se-menu-text">Custom colour…</span>
            {cur?.startsWith("#") && <span className="se-picker-chip" style={{ width: 14, height: 14, background: cur }} aria-hidden />}
          </button>
        )}
    </div>
  );
}

/** What the colour and highlight tools open. Slot `ColorMenu`. */
export const ColorMenu = overridable("ColorMenu", ColorMenuBase);

// ── paragraph ─────────────────────────────────────────────────────────────────
const ALIGNS: { value: Align; label: string; Icon: typeof AlignLeft; kbd: string }[] = [
  { value: "left", label: "Align left", Icon: AlignLeft, kbd: "Ctrl+Shift+L" },
  { value: "center", label: "Centre", Icon: AlignCenter, kbd: "Ctrl+Shift+E" },
  { value: "right", label: "Align right", Icon: AlignRight, kbd: "Ctrl+Shift+R" },
  { value: "justify", label: "Justify", Icon: AlignJustify, kbd: "Ctrl+Shift+J" },
];
export function AlignTool({ editor }: ToolProps) {
  const { state, off } = useToolState(editor);
  const atomAlign = state?.atom != null ? editor.getDoc().blocks[state.atom]?.align ?? "center" : null;
  const cur = atomAlign ?? state?.active.align ?? "left";
  const Icon = ALIGNS.find((a) => a.value === cur)?.Icon ?? AlignLeft;
  return (
    <PopoverButton label="Alignment" disabled={off} icon={<><Icon /><ChevronDown className="se-caret" /></>}>
      {(close) => ALIGNS.map(({ value, label, Icon: I, kbd }) => (
        <MenuItem key={value} icon={<I />} checked={cur === value} kbd={keys(kbd)} onSelect={() => { close(); editor.setAlign(value); }}>{label}</MenuItem>
      ))}
    </PopoverButton>
  );
}
const LISTS = {
  bullet: { label: "Bulleted list", kbd: "Ctrl+Shift+8", Icon: List },
  ordered: { label: "Numbered list", kbd: "Ctrl+Shift+7", Icon: ListOrdered },
  check: { label: "Checklist", kbd: "Ctrl+Shift+9", Icon: ListChecks },
} as const;
export function ListTool({ editor, kind }: ToolProps & { kind: "bullet" | "ordered" | "check" }) {
  const { state, off } = useToolState(editor);
  const { label, kbd, Icon } = LISTS[kind];
  return <ToolButton label={label} kbd={keys(kbd)} active={state?.active.list === kind} disabled={off || !!state?.cell} onClick={() => editor.toggleList(kind)}><Icon /></ToolButton>;
}
export function IndentTool({ editor, delta }: ToolProps & { delta: 1 | -1 }) {
  const { state, off } = useToolState(editor);
  const inList = !!state?.active.list && state.active.list !== null;
  return (
    <ToolButton label={delta > 0 ? "Indent more" : "Indent less"} kbd={delta > 0 ? "Tab" : "Shift+Tab"} disabled={off || !inList || !!state?.cell}
      onClick={() => editor.indent(delta)}>{delta > 0 ? <IndentIncrease /> : <IndentDecrease />}</ToolButton>
  );
}

// ── insert ────────────────────────────────────────────────────────────────────
export function LinkTool({ editor }: ToolProps) {
  const { state, off } = useToolState(editor);
  return <ToolButton label="Link" kbd={keys("Ctrl+K")} active={!!state?.link} disabled={off} onClick={() => editor.openLink()}><Link2 /></ToolButton>;
}
const MEDIA = {
  image: { label: "Image", Icon: ImageIcon },
  video: { label: "Video", Icon: Film },
  file: { label: "File attachment", Icon: File },
  media: { label: "Media library", Icon: Images },
} as const;
export function MediaTool({ editor, kind }: ToolProps & { kind: "image" | "video" | "file" | "media" }) {
  const { off } = useToolState(editor);
  const { label, Icon } = MEDIA[kind];
  if (kind === "media") {
    const kinds = (["image", "video", "file"] as const).filter((k) => editor.schema.has(k));
    return (
      <PopoverButton label="Insert media" disabled={off} icon={<><Icon /><ChevronDown className="se-caret" /></>}>
        {(close) => (
          <>
            {kinds.map((k) => { const M = MEDIA[k]; return <MenuItem key={k} icon={<M.Icon />} onSelect={() => { close(); editor.openGallery(k); }}>{M.label}…</MenuItem>; })}
            <MenuSeparator />
            <MenuItem icon={<Images />} onSelect={() => { close(); editor.openGallery(); }}>Browse library…</MenuItem>
          </>
        )}
      </PopoverButton>
    );
  }
  return <ToolButton label={label} disabled={off} onClick={() => editor.openGallery(kind)}><Icon /></ToolButton>;
}

export function TableTool({ editor }: ToolProps) {
  const { off } = useToolState(editor);
  const [hover, setHover] = useState<[number, number]>([0, 0]);
  const R = 8;
  const C = 10;
  return (
    <PopoverButton label="Table" disabled={off} icon={<Table />}>
      {(close) => (
        <div onMouseLeave={() => setHover([0, 0])}>
          <div className="se-grid-pick" style={{ gridTemplateColumns: `repeat(${C}, 18px)` }}>
            {Array.from({ length: R * C }, (_, i) => {
              const r = Math.floor(i / C) + 1;
              const c = (i % C) + 1;
              return (
                <button key={i} type="button" className="se-grid-cell" aria-label={`${r} by ${c}`} data-on={r <= hover[0] && c <= hover[1] ? "" : undefined}
                  onMouseEnter={() => setHover([r, c])} onMouseDown={keep} onClick={() => { close(); editor.insertTable(r, c, true); }} />
              );
            })}
          </div>
          <div className="se-grid-caption">{hover[0] ? `${hover[0]} × ${hover[1]}` : "Insert table"}</div>
        </div>
      )}
    </PopoverButton>
  );
}
export function RuleTool({ editor }: ToolProps) {
  const { off } = useToolState(editor);
  return <ToolButton label="Horizontal line" disabled={off} onClick={() => editor.insertRule()}><Minus /></ToolButton>;
}

// ── tools ─────────────────────────────────────────────────────────────────────
export function PainterTool({ editor }: ToolProps) {
  const { state, off } = useToolState(editor);
  return (
    <ToolButton label={state?.painting ? "Select text to apply (Esc to stop)" : "Copy formatting"} kbd={keys("Ctrl+Alt+C")}
      active={!!state?.painting} disabled={off}
      onClick={() => (state?.painting ? editor.engine?.cancelFormat() : editor.engine?.copyFormat())}><Paintbrush /></ToolButton>
  );
}
export function ClearTool({ editor }: ToolProps) {
  const { off } = useToolState(editor);
  return <ToolButton label="Clear formatting" kbd={keys("Ctrl+\\")} disabled={off} onClick={() => editor.clearFormatting()}><Eraser /></ToolButton>;
}
export function FindTool({ editor }: ToolProps) {
  const ui = useUI(editor);
  return <ToolButton label="Find and replace" kbd={keys("Ctrl+F")} active={ui.find} onClick={() => editor.toggleFind()}><Search /></ToolButton>;
}
export function PreviewTool({ editor }: ToolProps) {
  return <ToolButton label="Preview" onClick={() => editor.openPreview()}><Eye /></ToolButton>;
}
export function FullscreenTool({ editor }: ToolProps) {
  const ui = useUI(editor);
  return <ToolButton label={ui.fullscreen ? "Exit full screen" : "Full screen"} active={ui.fullscreen} onClick={() => editor.toggleFullscreen()}>{ui.fullscreen ? <Shrink /> : <Expand />}</ToolButton>;
}

/** A compact count (words, with the characters in its tooltip) and upload progress — the status bar, as a toolbar tool. */
export function StatusTool({ editor }: ToolProps) {
  const { state } = useToolState(editor);
  const ui = useUI(editor);
  const max = editor.config.maxLength;
  const len = state?.length ?? editor.getLength();
  const words = state?.words ?? editor.getWords();
  const busy = ui.uploads.filter((u) => !u.error);
  const failed = ui.uploads.filter((u) => u.error);
  const progress = busy.length ? busy.reduce((n, u) => n + u.progress, 0) / busy.length : 0;
  return (
    <span className="se-status" aria-live="polite">
      {failed.map((u) => <span key={u.id} className="se-error" title={`${u.name}: ${u.error}`}>Upload failed</span>)}
      {busy.length > 0 && (
        <span className="se-progress" title={busy.length > 1 ? `${busy.length} files` : busy[0].name}>
          <span className="se-progress-track"><span className="se-progress-fill" style={{ display: "block", width: `${Math.round(progress * 100)}%` }} /></span>
        </span>
      )}
      <span title={`${len.toLocaleString()}${max ? ` / ${max.toLocaleString()}` : ""} characters`} data-over={max && len > max ? "" : undefined}>
        {max ? `${len.toLocaleString()} / ${max.toLocaleString()}` : `${words.toLocaleString()} ${words === 1 ? "word" : "words"}`}
      </span>
    </span>
  );
}

/** One tool by id — what `Toolbar` lays out. */
export function Tool({ editor, id }: ToolProps & { id: string }): ReactNode {
  const custom = useContext(ComponentsContext).tools?.[id];
  if (custom) return createElement(custom, { editor, Default: BUILT_IN.has(id) ? builtIn(id) : undefined });
  return <BuiltInTool editor={editor} id={id} />;
}

const BUILT_IN = new Set(["undo", "redo", "block", "font", "size", "bold", "italic", "underline", "strike", "code", "sub", "sup",
  "color", "highlight", "align", "bullet", "ordered", "check", "indent", "outdent", "quote", "codeblock", "link", "image",
  "video", "file", "media", "table", "hr", "painter", "clear", "find", "preview", "fullscreen", "status"]);
const builtIns = new Map<string, (p: ToolProps) => ReactNode>();
/** The library's tool `id` as a component — the `Default` a replacement tool gets. */
function builtIn(id: string) {
  let C = builtIns.get(id);
  if (!C) { C = ({ editor }: ToolProps) => <BuiltInTool editor={editor} id={id} />; builtIns.set(id, C); }
  return C;
}

function BuiltInTool({ editor, id }: ToolProps & { id: string }): ReactNode {
  switch (id) {
    case "undo": return <UndoTool editor={editor} />;
    case "redo": return <RedoTool editor={editor} />;
    case "block": return <BlockTool editor={editor} />;
    case "font": return <FontTool editor={editor} />;
    case "size": return <SizeTool editor={editor} />;
    case "bold": case "italic": case "underline": case "strike": case "code": return <MarkTool editor={editor} mark={id} />;
    case "sub": case "sup": return <ScriptTool editor={editor} script={id} />;
    case "color": case "highlight": return <ColorTool editor={editor} kind={id} />;
    case "align": return <AlignTool editor={editor} />;
    case "bullet": case "ordered": case "check": return <ListTool editor={editor} kind={id} />;
    case "indent": return <IndentTool editor={editor} delta={1} />;
    case "outdent": return <IndentTool editor={editor} delta={-1} />;
    case "quote": return <BlockToggleTool editor={editor} type="quote" />;
    case "codeblock": return <BlockToggleTool editor={editor} type="code" />;
    case "link": return <LinkTool editor={editor} />;
    case "image": case "video": case "file": case "media": return <MediaTool editor={editor} kind={id} />;
    case "table": return <TableTool editor={editor} />;
    case "hr": return <RuleTool editor={editor} />;
    case "painter": return <PainterTool editor={editor} />;
    case "clear": return <ClearTool editor={editor} />;
    case "find": return <FindTool editor={editor} />;
    case "preview": return <PreviewTool editor={editor} />;
    case "fullscreen": return <FullscreenTool editor={editor} />;
    case "status": return <StatusTool editor={editor} />;
    default: return null;
  }
}


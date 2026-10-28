// ─── The editor instance ─────────────────────────────────────────────────────
// What `useSynTextEditor(config)` returns, and the whole API: read and write the document, run commands, listen
// to events, open the editor's dialogs. `render()` mounts the UI. No provider, no context, nothing drilled —
// pass the instance wherever it is needed.

import type { CSSProperties, ReactElement, ReactNode } from "react";
import { createElement } from "react";
import { toHTML, type HtmlOptions } from "./core/html";
import {
  docLength, docToPlain, docWords, emptyDoc, isEmptyDoc, safePoster, schemaOf, toDoc,
  type Align, type Block, type Format, type ListKind, type RichDoc, type Schema, type TextType, type Toggle,
} from "./core/model";
import type { Sel } from "./core/ops";
import type { CellRef } from "./core/table";
import { createRestStorage, kindOf, type Asset, type AssetKind, type RestStorageOptions, type StorageAdapter } from "./core/storage";
import type { ComponentsConfig } from "./UI/slots";
import { COLORS, HIGHLIGHTS, SIZES, loadFonts, resolveFonts, type FontOption, type FontsConfig, type Swatch } from "./core/styles";
import { RichEngine, type EditorState } from "./editor/engine";
import { captureFrame } from "./view/player";
import type { ContextItemId } from "./contextMenu";
import { PRESETS, type PresetName, type ToolbarLayout } from "./presets";

/** The parts `classNames` / `styles` reach. "layer" is the wrapper of the editor's menus and dialogs (portalled to <body>). */
export type Slot = "root" | "toolbar" | "content" | "surface" | "statusbar" | "layer";
export type ThemeMode = "light" | "dark" | "auto" | "inherit";
/** Theme variables by name without the prefix: `{ accent: "#e11d48", bg: "#fff" }` → `--se-accent`, `--se-bg`. */
export type ThemeVars = Partial<Record<
  | "bg" | "surface" | "surface-2" | "border" | "border-2" | "text" | "text-2" | "muted" | "accent" | "accent-hover" | "accent-fg"
  | "danger" | "popover" | "dialog" | "field" | "field-border" | "link" | "code-bg" | "code-text" | "pre-bg" | "quote-bar"
  | "table-border" | "table-head" | "radius" | "radius-sm" | "font" | "font-mono" | "content-font" | "btn" | "pad-x" | "pad-y"
  | "block-gap" | "list-indent" | (string & {}), string>>;

// ── the right-click menu ────────────────────────────────────────────────────

/** What was right-clicked. */
export type ContextTarget = "text" | "link" | "image" | "video" | "file" | "rule" | "table" | "cell";
export interface ContextMenuContext {
  editor: SynTextEditor;
  target: ContextTarget;
  /** text is selected (not just a caret) */
  hasSelection: boolean;
  /** the link under the pointer or around the caret */
  link: string | null;
  /** block index of the image / video / file / rule / table */
  index: number | null;
  block: Block | null;
  /** the table cell, when `target` is "cell" */
  cell: CellRef | null;
  readOnly: boolean;
  /** where the menu opens (viewport px) */
  x: number;
  y: number;
}
/** A row in the menu. `items` makes a submenu. A string "separator" is a divider. */
export type ContextMenuItem = "separator" | {
  id: string;
  label: string;
  icon?: ReactNode;
  kbd?: string;
  disabled?: boolean;
  checked?: boolean;
  danger?: boolean;
  onSelect?: (ctx: ContextMenuContext) => void;
  items?: ContextMenuItem[];
};
export interface ContextMenuConfig {
  /**
   * Which rows to show. A list of built-in ids picks and orders them (ids that don't apply to what was clicked are
   * skipped). A function gets the context and the default rows and returns the rows to show — filter, reorder, add
   * your own. Returning an empty list (or null) lets the browser's own menu open instead.
   */
  items?: (ContextItemId | "separator")[] | ((ctx: ContextMenuContext, defaults: ContextMenuItem[]) => ContextMenuItem[] | null | undefined);
  /** Shift + right-click opens the browser's own menu (default true). */
  nativeWithShift?: boolean;
}

export interface UploadConfig {
  /** `accept` for the file picker and a filter for pasted / dropped files. Default: images, video, common documents. */
  accept?: string;
  /** Largest file, in bytes (default 25 MB). */
  maxSize?: number;
  /**
   * Without storage, images and video up to this many bytes go into the document as data URLs (default 1 MB;
   * 0 turns it off). They make the document heavy — configure storage for real use.
   */
  inlineLimit?: number;
}

export interface SynTextEditorConfig {
  /** The initial document — a document, its JSON, or plain text. Pass it again later to replace the content (controlled). */
  value?: RichDoc | string | null;
  /** Every change; `null` when the editor is empty. */
  onChange?: (value: RichDoc | null, editor: SynTextEditor) => void;
  onFocus?: (editor: SynTextEditor) => void;
  onBlur?: (editor: SynTextEditor) => void;
  /** Uploads, rejected files and storage errors. */
  onError?: (error: Error, editor: SynTextEditor) => void;

  /** The right-click menu: `false` keeps the browser's own; an object chooses and adds items. Default: on. */
  contextMenu?: boolean | ContextMenuConfig;
  /**
   * Your own components for any part of the UI — buttons, menus, dialogs, the colour picker, the toolbar, single
   * tools… Each gets the part's props plus `Default` (the library's). See `SynComponents`.
   */
  components?: ComponentsConfig;

  /** "full" (a word processor, default), "standard", "basic" (text weight and lists), "minimal". */
  preset?: PresetName;
  /** What the document may hold — overrides the preset's. Paste and shortcuts keep to it too. */
  formats?: Format[];
  /** The toolbar's groups of tools — overrides the preset's. `false` hides it. */
  toolbar?: ToolbarLayout | false;
  /** Word / character count and upload progress under the editor. */
  statusbar?: boolean;
  /** The toolbar stays in view while the page scrolls. */
  stickyToolbar?: boolean;
  /** "wrap" (default) or "scroll" sideways when narrow. */
  toolbarWrap?: "wrap" | "scroll";

  placeholder?: string;
  readOnly?: boolean;
  autoFocus?: boolean;
  /** Characters of text; the status bar counts toward it. Not enforced while typing — validate on submit. */
  maxLength?: number;
  /** Height of the writing area (CSS length or px). */
  minHeight?: number | string;
  maxHeight?: number | string;
  /** "default" (bordered box), "borderless", or "document" (a page on a desk, for long-form writing). */
  variant?: "default" | "borderless" | "document";
  spellCheck?: boolean;
  id?: string;
  ariaLabel?: string;

  /** Where media goes: four functions, or four REST endpoints. Without it, the gallery offers links (and small inline files). */
  storage?: StorageAdapter | RestStorageOptions;
  upload?: UploadConfig;

  /** "light", "dark", "auto" (the system's), or "inherit" (default: a `.dark` ancestor switches it). */
  theme?: ThemeMode;
  /** "compact" (default) or "comfortable" — the spacing of the toolbar, dialogs and document. */
  density?: "compact" | "comfortable";
  /** Theme variables set inline on the editor — the quickest way to brand it. */
  vars?: ThemeVars;
  /** Extra classes per part (Tailwind classes work here). */
  classNames?: Partial<Record<Slot, string>>;
  /** Inline styles per part. */
  styles?: Partial<Record<Slot, CSSProperties>>;

  colors?: Swatch[];
  highlights?: Swatch[];
  /** The font menu: a list replaces the defaults; `{ add: [...] }` keeps them and pushes yours. Fonts with `src` are loaded. */
  fonts?: FontsConfig;
  sizes?: number[];
  /** Undo steps kept (default 300). */
  history?: number;
  /**
   * How dialogs are shown: `"dialog"` (default, centred) or `"sheet"` (a panel from the right edge — its top
   * offset is `--se-sheet-top`). An object chooses per dialog: `{ default: "dialog", gallery: "sheet" }`.
   */
  dialogs?: DialogVariant | Partial<Record<"default" | DialogKind, DialogVariant>>;
}

/** Where the caret is — see `SynTextEditor.getCaretContext()`. */
export interface CaretContext {
  /** Plain text of the caret's block (a paragraph, a list item, a heading, a table cell's paragraph). */
  text: string;
  /** Caret offset into `text`. */
  index: number;
  /** Index of the caret's block in the document (0 inside a table cell). */
  block: number;
  /** The caret's box relative to `container`'s scroll box — position a popup with `position: absolute` inside it. */
  bounds: { top: number; left: number; height: number } | null;
  /** The editor's scrolling box (`.se-scroll`; positioned). Null when it can't be found. */
  container: HTMLElement | null;
}

/** Which dialog is open — see `SynTextEditorConfig.dialogs`. */
export type DialogKind = "gallery" | "link" | "media" | "preview";
/** How a dialog is shown: centred over the page, or as a panel sliding in from the right edge. */
export type DialogVariant = "dialog" | "sheet";

export type EventName = "change" | "state" | "ui" | "focus" | "blur" | "ready" | "error" | "contextmenu";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Listener = (...args: any[]) => void;

export type Modal =
  | { kind: "gallery"; filter?: AssetKind; replace?: number; /** picking a thumbnail for the video at this index */ thumbnailFor?: number }
  | { kind: "link" }
  | { kind: "media"; index: number }
  | { kind: "preview" };
export interface Upload { id: string; name: string; progress: number; error?: string }
export interface OpenContextMenu { ctx: ContextMenuContext; items: ContextMenuItem[] }
export interface UIState {
  modal: Modal | null; find: boolean; fullscreen: boolean; uploads: Upload[]; contextMenu: OpenContextMenu | null;
  /** goes up each time options change (`setOptions`), so views subscribed to the UI redraw */
  rev: number;
}

const DEFAULT_ACCEPT = "image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip";
const isAdapter = (s: StorageAdapter | RestStorageOptions): s is StorageAdapter => typeof (s as StorageAdapter).upload === "function";

/**
 * Options that update after the editor is made — the hook passes them on whenever your props change, and
 * `editor.setOptions()` takes them directly. `value`, `readOnly` and the callbacks are live too (see the hook).
 */
export const LIVE_OPTIONS = [
  "preset", "formats", "toolbar", "statusbar", "stickyToolbar", "toolbarWrap", "placeholder", "maxLength", "minHeight",
  "maxHeight", "variant", "spellCheck", "ariaLabel", "theme", "density", "vars", "classNames", "styles", "colors",
  "highlights", "fonts", "sizes", "storage", "upload", "contextMenu", "components", "dialogs",
] as const satisfies readonly (keyof SynTextEditorConfig)[];
export type LiveOptions = Pick<SynTextEditorConfig, (typeof LIVE_OPTIONS)[number]>;

/** A stored file → the block that shows it. */
export function blockFromAsset(a: Asset, kind: AssetKind = kindOf(a.type)): Block {
  if (kind === "image") return { type: "image", src: a.url, alt: a.name.replace(/\.[a-z0-9]+$/i, ""), asset: a.id, spans: [] };
  if (kind === "video") {
    const poster = safePoster(a.thumbnail);
    return { type: "video", src: a.url, asset: a.id, ...(poster ? { poster } : {}), spans: [] };
  }
  return { type: "file", src: a.url, name: a.name, mime: a.type, ...(a.size !== undefined ? { bytes: a.size } : {}), asset: a.id, spans: [] };
}

export class SynTextEditor {
  readonly config: SynTextEditorConfig;
  /** What the editor allows (from `preset` / `formats`). */
  schema: Schema;
  /** The toolbar layout in use, or false. */
  toolbar: ToolbarLayout | false;
  /** The storage in use, or null. */
  storage: StorageAdapter | null;
  /** The engine, while the editor is on screen (`render()` mounts it). */
  engine: RichEngine | null = null;

  private doc: RichDoc;
  private lastEmitted: unknown;
  private listeners = new Map<EventName, Set<Listener>>();
  private ui: UIState = { modal: null, find: false, fullscreen: false, uploads: [], contextMenu: null, rev: 0 };
  private rest: RestStorageOptions | null = null;
  private engineOff: (() => void) | null = null;

  constructor(config: SynTextEditorConfig = {}) {
    this.config = { ...config };
    this.schema = this.toolbar = false as never;
    this.storage = null;
    this.derive(true);
    this.doc = toDoc(config.value, this.schema) ?? emptyDoc();
    this.lastEmitted = config.value;
  }

  /** Schema, toolbar and storage from the config. */
  private derive(all: boolean, changed: ReadonlySet<string> = new Set()) {
    const c = this.config;
    const preset = PRESETS[c.preset ?? "full"];
    if (all || changed.has("preset") || changed.has("formats")) {
      this.schema = schemaOf(c.formats ?? preset.formats);
      this.engine?.setSchema(this.schema);
    }
    if (all || changed.has("preset") || changed.has("toolbar")) this.toolbar = c.toolbar === false ? false : c.toolbar ?? preset.toolbar;
    if (all || changed.has("fonts")) loadFonts(resolveFonts(c.fonts));
    if (all || changed.has("storage")) {
      const st = c.storage;
      if (!st) { this.storage = null; this.rest = null; }
      else if (isAdapter(st)) { this.storage = st; this.rest = null; }
      // REST options are copied into one object the adapter reads on every call, so new headers or urls apply
      // without losing anything.
      else if (this.rest) Object.assign(this.rest, st);
      else { this.rest = { ...st }; this.storage = createRestStorage(this.rest); }
    }
  }

  /**
   * Change options after the editor is made (see `LIVE_OPTIONS`). Formats apply to what's typed and pasted from now
   * on — the document already written is kept as it is.
   */
  setOptions(patch: LiveOptions, { silent = false }: { silent?: boolean } = {}) {
    const changed = new Set<string>();
    for (const [k, v] of Object.entries(patch)) {
      if ((this.config as Record<string, unknown>)[k] !== v) { (this.config as Record<string, unknown>)[k] = v; changed.add(k); }
    }
    if (!changed.size) return;
    this.derive(false, changed);
    if (!silent) this.setUI({ rev: this.ui.rev + 1 });   // views subscribed to the UI redraw with the new options
  }

  /** Callbacks are read live, so a component can pass fresh closures every render. */
  updateCallbacks(c: Pick<SynTextEditorConfig, "onChange" | "onFocus" | "onBlur" | "onError">) {
    this.config.onChange = c.onChange;
    this.config.onFocus = c.onFocus;
    this.config.onBlur = c.onBlur;
    this.config.onError = c.onError;
  }

  // ── events ───────────────────────────────────────────────────────────────
  on(event: "change", fn: (value: RichDoc | null) => void): () => void;
  on(event: "state" | "ui" | "focus" | "blur" | "ready", fn: () => void): () => void;
  on(event: "error", fn: (error: Error) => void): () => void;
  on(event: "contextmenu", fn: (ctx: ContextMenuContext) => void): () => void;
  on(event: EventName, fn: Listener): () => void {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(fn);
    return () => { set!.delete(fn); };
  }
  once(event: EventName, fn: () => void): () => void {
    const off = this.on(event as "ready", () => { off(); fn(); });
    return off;
  }
  private emit(event: EventName, ...args: unknown[]) { this.listeners.get(event)?.forEach((f) => f(...args)); }

  // ── mounting (render.tsx calls these) ────────────────────────────────────
  /** Mount the engine on a surface element. Returns the teardown. */
  attach(surface: HTMLElement): () => void {
    const engine = new RichEngine(surface, this.doc, {
      schema: this.schema,
      readOnly: this.config.readOnly,
      history: this.config.history,
      onChange: (d) => {
        this.doc = d;
        const out = isEmptyDoc(d) ? null : d;
        this.lastEmitted = out;
        this.config.onChange?.(out, this);
        this.emit("change", out);
      },
      onFiles: (files, near) => { void this.uploadFiles(files, near); },
      onFocusChange: (f) => {
        if (f) { this.config.onFocus?.(this); this.emit("focus"); } else { this.config.onBlur?.(this); this.emit("blur"); }
      },
    });
    this.engine = engine;
    this.engineOff = engine.subscribe(() => this.emit("state"));
    if (this.config.autoFocus) requestAnimationFrame(() => engine.focus());
    this.emit("ready");
    this.emit("state");
    return () => {
      this.engineOff?.();
      this.doc = engine.doc;
      engine.destroy();
      if (this.engine === engine) this.engine = null;
    };
  }

  /** The editor's UI. Put it where the editor goes: `{editor.render()}`. */
  render(props: { className?: string; style?: CSSProperties } = {}): ReactElement {
    // Imported lazily by name so the instance module stays free of UI code for headless use.
    return createElement(SynTextEditor.View!, { editor: this, ...props });
  }
  /** Set by render.tsx — the component `render()` mounts. */
  static View: ((p: { editor: SynTextEditor; className?: string; style?: CSSProperties }) => ReactElement | null) | null = null;

  isReady() { return this.engine !== null; }

  // ── reading ──────────────────────────────────────────────────────────────
  /** The document, or null when empty. */
  getValue(): RichDoc | null { const d = this.getDoc(); return isEmptyDoc(d) ? null : d; }
  /** The document as it stands, empty or not. */
  getDoc(): RichDoc { return this.engine?.doc ?? this.doc; }
  getJSON(): string { return JSON.stringify(this.getDoc()); }
  getHTML(opts?: HtmlOptions): string { return toHTML(this.getDoc(), opts); }
  getText(): string { return docToPlain(this.getDoc()); }
  getLength(): number { return docLength(this.getDoc()); }
  getWords(): number { return docWords(this.getDoc()); }
  isEmpty(): boolean { return isEmptyDoc(this.getDoc()); }
  getState(): EditorState | null { return this.engine?.getState() ?? null; }
  getSelection(): Sel | null { return this.engine?.getSelection() ?? null; }
  /**
   * The caret in the text it sits in, with its box — for inline completion (`[%{` pickers, @mentions, slash menus).
   * Null when the editor isn't focused or an image / video / table is selected as a whole. Re-read it on the
   * `state` event, which fires on every caret move and edit.
   */
  getCaretContext(): CaretContext | null {
    const c = this.engine?.caretContext();
    if (!c) return null;
    const container = (this.engine!.surface.closest(".se-scroll") as HTMLElement | null) ?? null;
    let bounds: CaretContext["bounds"] = null;
    if (c.rect && container) {
      const box = container.getBoundingClientRect();
      bounds = { top: c.rect.top - box.top + container.scrollTop, left: c.rect.left - box.left + container.scrollLeft, height: c.rect.height };
    }
    return { text: c.text, index: c.index, block: c.block, bounds, container };
  }

  // ── writing ──────────────────────────────────────────────────────────────
  /** Replace the content (no undo step). Accepts a document, its JSON, plain text, or null. */
  setValue(value: RichDoc | string | null | undefined) {
    this.doc = toDoc(value, this.schema) ?? emptyDoc();
    this.lastEmitted = value;
    this.engine?.setDoc(this.doc);
    this.emit("state");
  }
  /** Used by the hook for controlled values: replace only when the value isn't what the editor last reported. */
  syncValue(value: RichDoc | string | null | undefined) { if (value !== this.lastEmitted) this.setValue(value); }
  clear() { this.setValue(null); }
  focus() { this.engine?.focus(); }
  blur() { this.engine?.blur(); }
  setReadOnly(readOnly: boolean) { this.config.readOnly = readOnly; this.engine?.setReadOnly(readOnly); this.emit("ui"); }
  isReadOnly() { return !!this.config.readOnly; }

  // ── commands ─────────────────────────────────────────────────────────────
  undo() { this.engine?.undo(); }
  redo() { this.engine?.redo(); }
  toggle(mark: Toggle) { this.engine?.toggle(mark); }
  toggleBold() { this.toggle("bold"); }
  toggleItalic() { this.toggle("italic"); }
  toggleUnderline() { this.toggle("underline"); }
  toggleStrike() { this.toggle("strike"); }
  toggleCode() { this.toggle("code"); }
  setScript(s: "sub" | "sup") { this.engine?.setScript(s); }
  setColor(c: string | null) { this.engine?.setColor(c); }
  setHighlight(c: string | null) { this.engine?.setHighlight(c); }
  setFont(f: string | null) { this.engine?.setFont(f); }
  setSize(px: number | null) { this.engine?.setSize(px); }
  setBlock(type: TextType) { this.engine?.setBlock(type); }
  setAlign(a: Align) { this.engine?.setAlign(a); }
  toggleList(kind: ListKind) { this.engine?.toggleList(kind); }
  indent(delta = 1) { this.engine?.indent(delta); }
  setLink(href: string | undefined, text?: string) { this.engine?.setLink(href, text); }
  clearFormatting() { this.engine?.clearFormatting(); }
  insertText(text: string) { this.engine?.insertText(text); }
  /**
   * Replace characters `[from, to)` of a block with `text`, keep the replaced text's formatting, and put the caret
   * after it. Offsets are those of `getCaretContext()`; `block` defaults to the caret's.
   */
  replaceRange(from: number, to: number, text: string, block?: number) { this.engine?.replaceRange(from, to, text, block); }
  /**
   * Highlight every occurrence of these phrases (case-insensitive), replacing earlier marks. A view of the text —
   * never in the document, the HTML or undo. Style it with `--se-mark`. Returns the number of matches.
   */
  markPhrases(phrases: string[]): number { return this.engine?.markPhrases(phrases) ?? 0; }
  clearMarks() { this.engine?.clearMarks(); }
  insertHTML(html: string) { this.engine?.insertHTML(html); }
  insertRule() { this.engine?.insertRule(); }
  insertTable(rows = 3, cols = 3, header = true) { this.engine?.insertTable(rows, cols, header); }
  insertImage(src: string, opts: { alt?: string; caption?: string; width?: number } = {}) { this.engine?.insertAtom({ type: "image", src, ...opts, spans: [] }); }
  insertVideo(src: string, opts: { caption?: string; width?: number; poster?: string } = {}) {
    const poster = safePoster(opts.poster);
    this.engine?.insertAtom({ type: "video", src, ...opts, poster, spans: [] });
  }

  // ── video thumbnails ─────────────────────────────────────────────────────
  /** Set (an image address) or clear (null) the thumbnail of the video at `index`. */
  setVideoThumbnail(index: number, src: string | null) {
    if (this.getDoc().blocks[index]?.type !== "video") return;
    const poster = src === null ? undefined : safePoster(src);
    if (src !== null && !poster) { this.fail(new Error("That address can't be used as a thumbnail")); return; }
    this.engine?.updateAtom({ poster }, index);
  }
  /**
   * Store an image for use as a thumbnail — through storage, or inline when there's none and it's small enough —
   * and return its address (null if it was refused or failed; the reason goes to `onError`).
   */
  async uploadThumbnail(file: File): Promise<string | null> {
    const [asset] = await this.uploadFiles([file], null, false, { thumbnail: true });
    return asset ? safePoster(asset.thumbnail ?? asset.url) ?? null : null;
  }
  /**
   * Make the frame the video at `index` shows now (in the editor) its thumbnail. Resolves true when it worked;
   * a video from a server that doesn't allow it (CORS) reports why through `onError`.
   */
  async captureThumbnail(index: number, video?: HTMLVideoElement | null): Promise<boolean> {
    const el = video ?? this.engine?.elementOf(index)?.querySelector("video");
    if (!el) return false;
    try {
      const blob = await captureFrame(el);
      const name = `thumbnail-${Math.round(el.currentTime * 10) / 10}s.jpg`;
      const src = await this.uploadThumbnail(new File([blob], name, { type: blob.type || "image/jpeg" }));
      if (!src) return false;
      this.setVideoThumbnail(index, src);
      return true;
    } catch (e) {
      this.fail(e as Error);
      return false;
    }
  }
  insertFile(src: string, opts: { name?: string; bytes?: number; mime?: string } = {}) { this.engine?.insertAtom({ type: "file", src, ...opts, spans: [] }); }
  insertAsset(a: Asset) { this.engine?.insertAtom(blockFromAsset(a)); }
  selectAll() { this.engine?.selectAll(); }

  // ── UI state: dialogs, find, fullscreen, uploads ─────────────────────────
  getUI(): UIState { return this.ui; }
  private setUI(patch: Partial<UIState>) { this.ui = { ...this.ui, ...patch }; this.emit("ui"); }
  /** The media library. `replace`: the block index of a media block to swap the file of. */
  openGallery(filter?: AssetKind, replace?: number) { this.setUI({ modal: { kind: "gallery", filter, replace } }); }
  openLink() { this.setUI({ modal: { kind: "link" } }); }
  openMediaDetails(index: number) { this.setUI({ modal: { kind: "media", index } }); }
  /** The media library, to choose an image as the thumbnail of the video at `index`. */
  openThumbnailLibrary(index: number) { this.setUI({ modal: { kind: "gallery", filter: "image", thumbnailFor: index } }); }
  openPreview() { this.setUI({ modal: { kind: "preview" } }); }
  closeModal() { this.setUI({ modal: null }); requestAnimationFrame(() => this.engine?.focus()); }
  toggleFind(open = !this.ui.find) { this.setUI({ find: open }); if (!open) { this.engine?.clearFind(); this.engine?.focus(); } }
  toggleFullscreen(on = !this.ui.fullscreen) { this.setUI({ fullscreen: on }); requestAnimationFrame(() => this.engine?.focus()); }

  /** Whether the right-click menu is on. */
  /** How the dialog `kind` is shown (see the `dialogs` option). */
  dialogVariant(kind: DialogKind): DialogVariant {
    const d = this.config.dialogs;
    return (typeof d === "string" ? d : d?.[kind] ?? d?.default) ?? "dialog";
  }
  get contextMenuEnabled() { return this.config.contextMenu !== false; }
  /**
   * Open the right-click menu at a point (viewport px) — by default at the caret. With `target`, the element that
   * was clicked: an image or table there is selected first, as a right-click does. Returns false when there was
   * nothing to show (the menu is off, or its items came back empty).
   */
  openContextMenu(x?: number, y?: number, target?: Element | null): boolean {
    const e = this.engine;
    if (!e || !this.contextMenuEnabled || !SynTextEditor.contextItems) return false;
    e.prepareContextMenu(target ?? null);
    if (x === undefined || y === undefined) ({ x, y } = e.caretPoint());
    const st = e.getState();
    const doc = e.doc;
    const index = st.atom ?? st.cell?.b ?? null;
    const block = index !== null ? doc.blocks[index] ?? null : null;
    const linkEl = target?.closest?.("a[href]") as HTMLAnchorElement | null;
    const target_: ContextTarget = st.cell ? "cell"
      : block?.type === "hr" ? "rule" : block?.type === "image" || block?.type === "video" || block?.type === "file" || block?.type === "table" ? block.type
      : linkEl || st.link ? "link" : "text";
    const sel = e.getSelection();
    const ctx: ContextMenuContext = {
      editor: this, target: target_, link: linkEl?.getAttribute("href") ?? st.link, index, block, cell: st.cell,
      hasSelection: !!sel && (sel.anchor.b !== sel.focus.b || sel.anchor.o !== sel.focus.o) && st.atom === null,
      readOnly: this.isReadOnly(), x, y,
    };
    const items = SynTextEditor.contextItems(ctx);
    if (!items.length) return false;
    this.setUI({ contextMenu: { ctx, items } });
    this.emit("contextmenu", ctx);
    return true;
  }
  closeContextMenu() { if (this.ui.contextMenu) this.setUI({ contextMenu: null }); }
  /** Set by the UI module — builds the rows for a context (defaults, then the host's `contextMenu.items`). */
  static contextItems: ((ctx: ContextMenuContext) => ContextMenuItem[]) | null = null;

  // ── uploads ──────────────────────────────────────────────────────────────
  get uploadConfig(): Required<UploadConfig> {
    const u = this.config.upload ?? {};
    return { accept: u.accept ?? DEFAULT_ACCEPT, maxSize: u.maxSize ?? 25 * 1024 * 1024, inlineLimit: u.inlineLimit ?? 1024 * 1024 };
  }
  /** Whether a file of this kind may go into the document at all. */
  accepts(file: File, { thumbnail = false }: { thumbnail?: boolean } = {}): string | null {
    const kind = kindOf(file.type);
    if (thumbnail) { if (kind !== "image") return `${file.name}: a thumbnail must be an image`; }      // not in the document's formats
    else if (!this.schema.has(kind)) return `${kind === "file" ? "Files" : kind === "image" ? "Images" : "Videos"} aren't allowed here`;
    const { accept, maxSize, inlineLimit } = this.uploadConfig;
    const ok = thumbnail || accept.split(",").map((s) => s.trim().toLowerCase()).some((a) =>
      a === "*" || a === "*/*" || (a.endsWith("/*") ? file.type.startsWith(a.slice(0, -1)) : a.startsWith(".") ? file.name.toLowerCase().endsWith(a) : file.type === a));
    if (!ok) return `${file.name}: this type of file isn't accepted`;
    if (file.size > maxSize) return `${file.name} is larger than ${Math.round(maxSize / 1024 / 1024)} MB`;
    if (!this.storage && (kind === "file" || file.size > inlineLimit)) {
      return inlineLimit && kind !== "file" ? `${file.name} is too large to embed without storage` : "Uploading needs storage — set `storage` on the editor";
    }
    return null;
  }

  /**
   * Upload files and return what was stored. With `insert`, each goes into the document as it arrives —
   * after `near` when given (the block they were dropped on), else at the caret.
   */
  async uploadFiles(files: File[], near: Block | null = null, insert = true, { thumbnail = false }: { thumbnail?: boolean } = {}): Promise<Asset[]> {
    const done: Asset[] = [];
    await Promise.all(files.map(async (file) => {
      const id = Math.random().toString(36).slice(2);
      const problem = this.accepts(file, { thumbnail });
      if (problem) { this.fail(new Error(problem)); return; }
      this.setUI({ uploads: [...this.ui.uploads, { id, name: file.name, progress: 0 }] });
      const progress = (p: number) => this.setUI({ uploads: this.ui.uploads.map((u) => (u.id === id ? { ...u, progress: p } : u)) });
      try {
        const asset = this.storage
          ? await this.storage.upload(file, { onProgress: progress })
          : await inlineAsset(file);
        done.push(asset);
        if (insert) this.engine?.insertAtom(blockFromAsset(asset), near);
        this.setUI({ uploads: this.ui.uploads.filter((u) => u.id !== id) });
      } catch (err) {
        this.setUI({ uploads: this.ui.uploads.map((u) => (u.id === id ? { ...u, error: (err as Error).message } : u)) });
        this.fail(err as Error);
        setTimeout(() => this.setUI({ uploads: this.ui.uploads.filter((u) => u.id !== id) }), 5000);
      }
    }));
    return done;
  }
  fail(error: Error) { this.config.onError?.(error, this); this.emit("error", error); }

  // ── look ─────────────────────────────────────────────────────────────────
  get palette() {
    return {
      colors: this.config.colors ?? COLORS, highlights: this.config.highlights ?? HIGHLIGHTS,
      fonts: resolveFonts(this.config.fonts), sizes: this.config.sizes ?? SIZES,
    };
  }
  /**
   * Push fonts onto the font menu (and load their `src`) — after the ones it has, replacing any with the same
   * value. With the hook, prefer the `fonts` option; a later change to it replaces what was pushed here.
   */
  addFonts(...fonts: FontOption[]) {
    const keep = this.palette.fonts.filter((f) => !fonts.some((a) => a.value === f.value));
    this.setOptions({ fonts: [...keep, ...fonts] });
  }
  /** The classes that set the theme and density on the root and its layer. */
  get themeClass(): string {
    const t = this.config.theme ?? "inherit";
    const theme = t === "dark" ? "se-dark" : t === "light" ? "se-light" : t === "auto" ? "se-auto" : "";
    return [theme, this.config.density === "comfortable" ? "se-comfortable" : ""].filter(Boolean).join(" ");
  }
  /** `vars` as inline custom properties. */
  get varStyle(): CSSProperties {
    const s: Record<string, string> = {};
    for (const [k, v] of Object.entries(this.config.vars ?? {})) if (v) s[k.startsWith("--") ? k : `--se-${k}`] = v;
    return s as CSSProperties;
  }
}

function inlineAsset(file: File): Promise<Asset> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve({ id: `inline-${Date.now()}`, url: String(r.result), name: file.name, type: file.type, size: file.size });
    r.onerror = () => reject(new Error(`Couldn't read ${file.name}`));
    r.readAsDataURL(file);
  });
}

/** An editor outside React (tests, vanilla pages): `createSynTextEditor(config)` then `editor.attach(element)`. */
export const createSynTextEditor = (config?: SynTextEditorConfig) => new SynTextEditor(config);

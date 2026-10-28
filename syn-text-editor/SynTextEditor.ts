// ─── The editor instance ─────────────────────────────────────────────────────
// What `useSynTextEditor(config)` returns, and the whole API: read and write the document, run commands, listen
// to events, open the editor's dialogs. `render()` mounts the UI. No provider, no context, nothing drilled —
// pass the instance wherever it is needed.

import type { CSSProperties, ReactElement } from "react";
import { createElement } from "react";
import { toHTML, type HtmlOptions } from "./core/html";
import {
  docLength, docToPlain, docWords, emptyDoc, isEmptyDoc, schemaOf, toDoc,
  type Align, type Block, type Format, type ListKind, type RichDoc, type Schema, type TextType, type Toggle,
} from "./core/model";
import type { Sel } from "./core/ops";
import { createRestStorage, kindOf, type Asset, type AssetKind, type RestStorageOptions, type StorageAdapter } from "./core/storage";
import { COLORS, FONTS, HIGHLIGHTS, SIZES, type FontOption, type Swatch } from "./core/styles";
import { RichEngine, type EditorState } from "./editor/engine";
import { PRESETS, type PresetName, type ToolbarLayout } from "./presets";

export type Slot = "root" | "toolbar" | "content" | "surface" | "statusbar";
export type ThemeMode = "light" | "dark" | "auto" | "inherit";
/** Theme variables by name without the prefix: `{ accent: "#e11d48", bg: "#fff" }` → `--se-accent`, `--se-bg`. */
export type ThemeVars = Partial<Record<
  | "bg" | "surface" | "surface-2" | "border" | "border-2" | "text" | "text-2" | "muted" | "accent" | "accent-hover" | "accent-fg"
  | "danger" | "popover" | "dialog" | "field" | "field-border" | "link" | "code-bg" | "code-text" | "pre-bg" | "quote-bar"
  | "table-border" | "table-head" | "radius" | "radius-sm" | "font" | "font-mono" | "content-font" | "btn" | "pad-x" | "pad-y"
  | "block-gap" | "list-indent" | (string & {}), string>>;

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
  /** Theme variables set inline on the editor — the quickest way to brand it. */
  vars?: ThemeVars;
  /** Extra classes per part (Tailwind classes work here). */
  classNames?: Partial<Record<Slot, string>>;
  /** Inline styles per part. */
  styles?: Partial<Record<Slot, CSSProperties>>;

  colors?: Swatch[];
  highlights?: Swatch[];
  fonts?: FontOption[];
  sizes?: number[];
  /** Undo steps kept (default 300). */
  history?: number;
}

export type EventName = "change" | "state" | "ui" | "focus" | "blur" | "ready" | "error";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Listener = (...args: any[]) => void;

export type Modal =
  | { kind: "gallery"; filter?: AssetKind; replace?: number }
  | { kind: "link" }
  | { kind: "media"; index: number }
  | { kind: "preview" };
export interface Upload { id: string; name: string; progress: number; error?: string }
export interface UIState { modal: Modal | null; find: boolean; fullscreen: boolean; uploads: Upload[] }

const DEFAULT_ACCEPT = "image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip";
const isAdapter = (s: StorageAdapter | RestStorageOptions): s is StorageAdapter => typeof (s as StorageAdapter).upload === "function";

/** A stored file → the block that shows it. */
export function blockFromAsset(a: Asset, kind: AssetKind = kindOf(a.type)): Block {
  if (kind === "image") return { type: "image", src: a.url, alt: a.name.replace(/\.[a-z0-9]+$/i, ""), asset: a.id, spans: [] };
  if (kind === "video") return { type: "video", src: a.url, asset: a.id, spans: [] };
  return { type: "file", src: a.url, name: a.name, mime: a.type, ...(a.size !== undefined ? { bytes: a.size } : {}), asset: a.id, spans: [] };
}

export class SynTextEditor {
  readonly config: SynTextEditorConfig;
  readonly schema: Schema;
  readonly toolbar: ToolbarLayout | false;
  readonly storage: StorageAdapter | null;
  /** The engine, while the editor is on screen (`render()` mounts it). */
  engine: RichEngine | null = null;

  private doc: RichDoc;
  private lastEmitted: unknown;
  private listeners = new Map<EventName, Set<Listener>>();
  private ui: UIState = { modal: null, find: false, fullscreen: false, uploads: [] };
  private engineOff: (() => void) | null = null;

  constructor(config: SynTextEditorConfig = {}) {
    this.config = { ...config };
    const preset = PRESETS[config.preset ?? "full"];
    this.schema = schemaOf(config.formats ?? preset.formats);
    this.toolbar = config.toolbar === false ? false : config.toolbar ?? preset.toolbar;
    this.storage = config.storage ? (isAdapter(config.storage) ? config.storage : createRestStorage(config.storage)) : null;
    this.doc = toDoc(config.value, this.schema) ?? emptyDoc();
    this.lastEmitted = config.value;
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
  insertHTML(html: string) { this.engine?.insertHTML(html); }
  insertRule() { this.engine?.insertRule(); }
  insertTable(rows = 3, cols = 3, header = true) { this.engine?.insertTable(rows, cols, header); }
  insertImage(src: string, opts: { alt?: string; caption?: string; width?: number } = {}) { this.engine?.insertAtom({ type: "image", src, ...opts, spans: [] }); }
  insertVideo(src: string, opts: { caption?: string; width?: number } = {}) { this.engine?.insertAtom({ type: "video", src, ...opts, spans: [] }); }
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
  openPreview() { this.setUI({ modal: { kind: "preview" } }); }
  closeModal() { this.setUI({ modal: null }); requestAnimationFrame(() => this.engine?.focus()); }
  toggleFind(open = !this.ui.find) { this.setUI({ find: open }); if (!open) { this.engine?.clearFind(); this.engine?.focus(); } }
  toggleFullscreen(on = !this.ui.fullscreen) { this.setUI({ fullscreen: on }); requestAnimationFrame(() => this.engine?.focus()); }

  // ── uploads ──────────────────────────────────────────────────────────────
  get uploadConfig(): Required<UploadConfig> {
    const u = this.config.upload ?? {};
    return { accept: u.accept ?? DEFAULT_ACCEPT, maxSize: u.maxSize ?? 25 * 1024 * 1024, inlineLimit: u.inlineLimit ?? 1024 * 1024 };
  }
  /** Whether a file of this kind may go into the document at all. */
  accepts(file: File): string | null {
    const kind = kindOf(file.type);
    if (!this.schema.has(kind)) return `${kind === "file" ? "Files" : kind === "image" ? "Images" : "Videos"} aren't allowed here`;
    const { accept, maxSize, inlineLimit } = this.uploadConfig;
    const ok = accept.split(",").map((s) => s.trim().toLowerCase()).some((a) =>
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
  async uploadFiles(files: File[], near: Block | null = null, insert = true): Promise<Asset[]> {
    const done: Asset[] = [];
    await Promise.all(files.map(async (file) => {
      const id = Math.random().toString(36).slice(2);
      const problem = this.accepts(file);
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
      fonts: this.config.fonts ?? FONTS, sizes: this.config.sizes ?? SIZES,
    };
  }
  /** The class that sets the theme on the root and its layer. */
  get themeClass(): string {
    const t = this.config.theme ?? "inherit";
    return t === "dark" ? "se-dark" : t === "light" ? "se-light" : t === "auto" ? "se-auto" : "";
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

"use client";
// ─── The right-click menu: its rows ───────────────────────────────────────────
// The default rows for what was clicked — text, a link, an image, video, file, rule, a table or a cell — kept to
// what the editor allows, then the host's `contextMenu.items` applied on top. The menu itself is UI/ContextMenu.

import {
  AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowDownToLine, ArrowLeftToLine, ArrowRightToLine, ArrowUp, ArrowUpToLine,
  Bold, ClipboardPaste, ClipboardType, Code, Code2, Copy, Eraser, ExternalLink, Film, Heading, Image as ImageIcon, Italic,
  Link2, List, ListChecks, ListOrdered, Minus, MoveHorizontal, Paperclip, Pencil, Pilcrow, Plus, Quote, Replace, Scissors,
  Strikethrough, Subscript, Superscript, Table, TextSelect, Trash2, Type, Underline, Unlink,
} from "lucide-react";
import { BLOCK_LABEL, type TextType } from "./core/model";
import { SynTextEditor, type ContextMenuContext, type ContextMenuItem } from "./SynTextEditor";

/** Every built-in row, by id — for `contextMenu.items: ["cut", "copy", "separator", "bold"]`. */
export const CONTEXT_ITEM_IDS = [
  "cut", "copy", "paste", "pastePlain", "selectAll",
  "bold", "italic", "underline", "strike", "format", "turnInto", "clear",
  "link", "openLink", "copyLink", "removeLink", "insert",
  "align", "width", "details", "replace", "openFile", "copyAddress", "moveUp", "moveDown", "delete",
  "tableInsert", "tableDelete", "header",
  // rows inside submenus — pick them with a list too, and they're lifted out to the top level
  "code", "sup", "sub", "p", "h1", "h2", "h3", "h4", "quote", "bullet", "ordered", "check",
  "image", "video", "file", "table", "hr", "rowAbove", "rowBelow", "colLeft", "colRight", "deleteRow", "deleteCol", "deleteTable",
] as const;
export type ContextItemId = (typeof CONTEXT_ITEM_IDS)[number];

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const k = (keys: string) => (isMac ? keys.replace(/Ctrl\+/g, "⌘").replace(/Alt\+/g, "⌥").replace(/Shift\+/g, "⇧") : keys);
const SEP = "separator" as const;

/** Read the clipboard into the editor (the browser may ask for permission, or refuse). */
export async function pasteFromClipboard(editor: SynTextEditor, plain = false) {
  editor.focus();
  try {
    if (!plain && navigator.clipboard?.read) {
      for (const item of await navigator.clipboard.read()) {
        const image = item.types.find((t) => t.startsWith("image/"));
        if (item.types.includes("text/html")) { editor.insertHTML(await (await item.getType("text/html")).text()); return; }
        if (image) {
          const blob = await item.getType(image);
          await editor.uploadFiles([new File([blob], `pasted-${Date.now()}.${image.split("/")[1]}`, { type: image })]);
          return;
        }
      }
    }
    const text = await navigator.clipboard.readText();
    if (text) editor.insertText(text);
  } catch {
    editor.fail(new Error(`The browser didn't allow reading the clipboard — paste with ${k("Ctrl+V")}`));
  }
}
/** Cut or copy the selection through the editor's own clipboard handling. */
function clip(editor: SynTextEditor, cmd: "cut" | "copy") {
  editor.focus();
  if (!document.execCommand(cmd)) editor.fail(new Error(`Use ${k(cmd === "cut" ? "Ctrl+X" : "Ctrl+C")} to ${cmd}`));
}
const copyText = (editor: SynTextEditor, text: string) => {
  navigator.clipboard?.writeText(text).catch(() => editor.fail(new Error("The browser didn't allow writing to the clipboard")));
};

/** The rows the editor offers for what was clicked, before the host's `contextMenu.items`. */
export function defaultContextItems(ctx: ContextMenuContext): ContextMenuItem[] {
  const { editor: ed, target, readOnly, block, index } = ctx;
  const has = (f: Parameters<typeof ed.schema.has>[0]) => ed.schema.has(f);
  const engine = ed.engine;
  const st = ed.getState();
  const marks = st?.active.marks ?? {};
  const out: ContextMenuItem[] = [];
  const add = (...items: (ContextMenuItem | false | null | undefined)[]) => { for (const i of items) if (i) out.push(i); };

  // Clipboard
  const atom = target === "image" || target === "video" || target === "file" || target === "rule" || target === "table";
  if (!readOnly) add({ id: "cut", label: "Cut", icon: <Scissors />, kbd: k("Ctrl+X"), disabled: !ctx.hasSelection && !atom, onSelect: () => clip(ed, "cut") });
  add({ id: "copy", label: "Copy", icon: <Copy />, kbd: k("Ctrl+C"), disabled: !ctx.hasSelection && !atom, onSelect: () => clip(ed, "copy") });
  if (!readOnly && !atom) {
    add({ id: "paste", label: "Paste", icon: <ClipboardPaste />, kbd: k("Ctrl+V"), onSelect: () => void pasteFromClipboard(ed) },
      { id: "pastePlain", label: "Paste as plain text", icon: <ClipboardType />, kbd: k("Ctrl+Shift+V"), onSelect: () => void pasteFromClipboard(ed, true) });
  }

  // Links (text and cells)
  if (target === "link" || ((target === "text" || target === "cell") && ctx.link)) {
    add(SEP);
    if (!readOnly && has("link")) add({ id: "link", label: "Edit link…", icon: <Link2 />, kbd: k("Ctrl+K"), onSelect: () => ed.openLink() });
    add({ id: "openLink", label: "Open link", icon: <ExternalLink />, onSelect: () => window.open(ctx.link!, "_blank", "noopener,noreferrer") },
      { id: "copyLink", label: "Copy link address", icon: <Copy />, onSelect: () => copyText(ed, ctx.link!) });
    if (!readOnly) add({ id: "removeLink", label: "Remove link", icon: <Unlink />, onSelect: () => ed.setLink(undefined) });
  }

  if (!readOnly && (target === "text" || target === "link" || target === "cell")) {
    // Formatting
    const quick = (["bold", "italic", "underline", "strike"] as const).filter(has);
    const MARK = { bold: ["Bold", Bold, "Ctrl+B"], italic: ["Italic", Italic, "Ctrl+I"], underline: ["Underline", Underline, "Ctrl+U"], strike: ["Strikethrough", Strikethrough, "Ctrl+Shift+X"] } as const;
    const fmt: ContextMenuItem[] = quick.map((m) => {
      const [label, I, kb] = MARK[m];
      return { id: m, label, icon: <I />, kbd: k(kb), checked: !!marks[m], onSelect: () => ed.toggle(m) };
    });
    if (has("code")) fmt.push({ id: "code", label: "Inline code", icon: <Code />, kbd: k("Ctrl+E"), checked: !!marks.code, onSelect: () => ed.toggleCode() });
    if (has("script")) fmt.push(
      { id: "sup", label: "Superscript", icon: <Superscript />, kbd: k("Ctrl+."), checked: marks.script === "sup", onSelect: () => ed.setScript("sup") },
      { id: "sub", label: "Subscript", icon: <Subscript />, kbd: k("Ctrl+,"), checked: marks.script === "sub", onSelect: () => ed.setScript("sub") },
    );
    if (fmt.length) add(SEP, { id: "format", label: "Format", icon: <Type />, items: [...fmt, SEP, { id: "clear", label: "Clear formatting", icon: <Eraser />, kbd: k("Ctrl+\\"), onSelect: () => ed.clearFormatting() }] });

    // Block kind and lists (not in a cell)
    if (target !== "cell") {
      const kinds = (Object.keys(BLOCK_LABEL) as TextType[]).filter((t) => has(t));
      const lists = ([["bullet", "Bulleted list", List], ["ordered", "Numbered list", ListOrdered], ["check", "Checklist", ListChecks]] as const).filter(([l]) => has(l));
      const KIND_ICON: Record<TextType, typeof Pilcrow> = { p: Pilcrow, h1: Heading, h2: Heading, h3: Heading, h4: Heading, quote: Quote, code: Code2 };
      const into: ContextMenuItem[] = [
        ...kinds.map((t): ContextMenuItem => { const I = KIND_ICON[t]; return { id: t, label: BLOCK_LABEL[t], icon: <I />, checked: st?.active.block === t && !st?.active.list, onSelect: () => ed.setBlock(t) }; }),
        ...(lists.length && kinds.length ? [SEP] : []),
        ...lists.map(([l, label, I]): ContextMenuItem => ({ id: l, label, icon: <I />, checked: st?.active.list === l, onSelect: () => ed.toggleList(l) })),
      ];
      if (into.length > 1) add({ id: "turnInto", label: "Turn into", icon: <Pilcrow />, items: into });
    }
    if (!ctx.link && has("link")) add({ id: "link", label: "Add link…", icon: <Link2 />, kbd: k("Ctrl+K"), onSelect: () => ed.openLink() });
    if (!fmt.length) add({ id: "clear", label: "Clear formatting", icon: <Eraser />, kbd: k("Ctrl+\\"), onSelect: () => ed.clearFormatting() });
  }

  // Insert (not in a cell)
  if (!readOnly && (target === "text" || target === "link")) {
    const ins: ContextMenuItem[] = [];
    if (has("image")) ins.push({ id: "image", label: "Image…", icon: <ImageIcon />, onSelect: () => ed.openGallery("image") });
    if (has("video")) ins.push({ id: "video", label: "Video…", icon: <Film />, onSelect: () => ed.openGallery("video") });
    if (has("file")) ins.push({ id: "file", label: "File…", icon: <Paperclip />, onSelect: () => ed.openGallery("file") });
    if (has("table")) ins.push({ id: "table", label: "Table (3 × 3)", icon: <Table />, onSelect: () => ed.insertTable(3, 3) });
    if (has("hr")) ins.push({ id: "hr", label: "Horizontal line", icon: <Minus />, onSelect: () => ed.insertRule() });
    if (ins.length) add(SEP, { id: "insert", label: "Insert", icon: <Plus />, items: ins });
  }

  // Tables
  if (!readOnly && (target === "cell" || target === "table") && engine) {
    add(SEP,
      { id: "tableInsert", label: "Insert row / column", icon: <Plus />, items: [
        { id: "rowAbove", label: "Row above", icon: <ArrowUpToLine />, onSelect: () => engine.addRow(0) },
        { id: "rowBelow", label: "Row below", icon: <ArrowDownToLine />, onSelect: () => engine.addRow(1) },
        { id: "colLeft", label: "Column left", icon: <ArrowLeftToLine />, onSelect: () => engine.addCol(0) },
        { id: "colRight", label: "Column right", icon: <ArrowRightToLine />, onSelect: () => engine.addCol(1) },
      ] },
      { id: "tableDelete", label: "Delete row / column / table", icon: <Trash2 />, items: [
        { id: "deleteRow", label: "Row", onSelect: () => engine.deleteRow() },
        { id: "deleteCol", label: "Column", onSelect: () => engine.deleteCol() },
        SEP,
        { id: "deleteTable", label: "Table", danger: true, onSelect: () => engine.deleteTable() },
      ] },
      { id: "header", label: "Header row", icon: <Heading />, checked: !!block?.head, onSelect: () => engine.toggleHeader() });
  }

  // Media
  if ((target === "image" || target === "video" || target === "file") && block && index !== null) {
    const media = target !== "file";
    if (!readOnly && engine) {
      add(SEP);
      if (media) {
        const align = block.align ?? "center";
        add({ id: "align", label: "Align", icon: <AlignCenter />, items: [
          { id: "left", label: "Left", icon: <AlignLeft />, checked: align === "left", onSelect: () => engine.updateAtom({ align: "left" }, index) },
          { id: "center", label: "Centre", icon: <AlignCenter />, checked: align === "center", onSelect: () => engine.updateAtom({ align: undefined }, index) },
          { id: "right", label: "Right", icon: <AlignRight />, checked: align === "right", onSelect: () => engine.updateAtom({ align: "right" }, index) },
        ] },
        { id: "width", label: "Width", icon: <MoveHorizontal />, items: [25, 33, 50, 66, 75, 100].map((w): ContextMenuItem => (
          { id: `w${w}`, label: `${w}%`, checked: (block.width ?? 100) === w, onSelect: () => engine.updateAtom({ width: w }, index) })) });
      }
      add({ id: "details", label: target === "image" ? "Alt text and caption…" : target === "video" ? "Caption and width…" : "Rename…", icon: <Pencil />, onSelect: () => ed.openMediaDetails(index) },
        { id: "replace", label: `Replace ${target}…`, icon: <Replace />, onSelect: () => ed.openGallery(target, index) });
    }
    add(SEP,
      { id: "openFile", label: `Open ${target} in new tab`, icon: <ExternalLink />, onSelect: () => window.open(block.src, "_blank", "noopener,noreferrer") },
      { id: "copyAddress", label: `Copy ${target} address`, icon: <Copy />, onSelect: () => copyText(ed, block.src ?? "") });
  }

  // Any whole block: move, delete
  if (!readOnly && atom && engine && index !== null) {
    add(SEP,
      { id: "moveUp", label: "Move up", icon: <ArrowUp />, disabled: index === 0, onSelect: () => engine.moveAtom(-1, index) },
      { id: "moveDown", label: "Move down", icon: <ArrowDown />, disabled: index >= ed.getDoc().blocks.length - 1, onSelect: () => engine.moveAtom(1, index) },
      { id: "delete", label: target === "table" ? "Delete table" : "Delete", icon: <Trash2 />, kbd: "Del", danger: true, onSelect: () => engine.removeAtom(index) });
  }

  if (target !== "cell" && !atom) add(SEP, { id: "selectAll", label: "Select all", icon: <TextSelect />, kbd: k("Ctrl+A"), onSelect: () => ed.selectAll() });
  return tidy(out);
}

/** No separators at the ends or twice in a row; submenus tidied too, and empty ones dropped. */
export function tidy(items: ContextMenuItem[]): ContextMenuItem[] {
  const out: ContextMenuItem[] = [];
  for (const it of items) {
    if (it === SEP) { if (out.length && out[out.length - 1] !== SEP) out.push(SEP); continue; }
    if (it.items) { const sub = tidy(it.items); if (!sub.length) continue; out.push({ ...it, items: sub }); continue; }
    out.push(it);
  }
  while (out[out.length - 1] === SEP) out.pop();
  return out;
}

/** The rows to show: the defaults, then the host's `contextMenu.items` (a list of ids, or a function). */
export function resolveContextItems(ctx: ContextMenuContext): ContextMenuItem[] {
  const cfg = ctx.editor.config.contextMenu;
  const defaults = defaultContextItems(ctx);
  const items = typeof cfg === "object" ? cfg.items : undefined;
  if (!items) return defaults;
  if (typeof items === "function") return tidy(items(ctx, defaults) ?? []);
  // Ids reach into submenus too: ["bold", "italic"] lifts them out of Format.
  const byId = new Map<string, ContextMenuItem>();
  const index = (list: ContextMenuItem[]) => list.forEach((d) => { if (d !== SEP) { if (!byId.has(d.id)) byId.set(d.id, d); if (d.items) index(d.items); } });
  index(defaults);
  return tidy(items.map((id) => (id === SEP ? SEP : byId.get(id))).filter((x): x is ContextMenuItem => !!x));
}

SynTextEditor.contextItems = resolveContextItems;

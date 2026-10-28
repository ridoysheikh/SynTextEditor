// The server-safe half: the document model, HTML in and out, and the viewer. No hooks, no "use client", no
// editor — import from "@syntext/react/view" in a Server Component to render or convert stored documents.

export { SynTextView } from "./view/SynTextView";
export type { SynTextViewProps } from "./view/SynTextView";

export { toHTML, parseHtml, clipboardHtml } from "./core/html";
export type { HtmlOptions } from "./core/html";

export {
  toDoc, isDoc, emptyDoc, isEmptyDoc, docToPlain, docLength, docWords, plainToDoc, cleanBlock, schemaOf, safeLink, safeSrc,
  ALL_FORMATS, BLOCK_LABEL, BLOCK_SIZE, SIZE_MIN, SIZE_MAX, MAX_INDENT, isAtom,
} from "./core/model";
export type {
  RichDoc, Block, Span, Marks, Cell, BlockType, TextType, AtomType, Align, ListKind, Toggle, MarkKey, Format, Schema,
} from "./core/model";
export { COLORS, HIGHLIGHTS, FONTS, SIZES, colorValue } from "./core/styles";
export type { Swatch, FontOption } from "./core/styles";

/** Plain text of a stored value (a document, its JSON, or text). */
export { docToPlain as toPlainText } from "./core/model";

/** Presets are plain data — use `PRESETS.basic.formats` with `schemaOf` to validate on a server. */
export { PRESETS } from "./presets";
export type { PresetName, Preset, ToolId, ToolbarLayout } from "./presets";

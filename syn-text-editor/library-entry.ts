"use client";
// Public library exports. The instance returned by `useSynTextEditor` IS the API — no provider, no context, no
// controlled props required; `config` is initial state (plus `value` / `readOnly` / callbacks, kept live).

// ── Styles ────────────────────────────────────────────────────────────────────
import "./styles/globals.lib.css";

// ── The editor ────────────────────────────────────────────────────────────────
export { SynTextEditor, createSynTextEditor, blockFromAsset } from "./SynTextEditor";
export type {
  SynTextEditorConfig, UploadConfig, ThemeMode, ThemeVars, Slot, EventName, Modal as EditorModal, Upload, UIState,
} from "./SynTextEditor";
export { useSynTextEditor, useEditorValue, SynEditor } from "./react";
export { EditorView } from "./render";
export type { EditorState } from "./editor/engine";
export { RichEngine } from "./editor/engine";

// ── Presets ───────────────────────────────────────────────────────────────────
export { PRESETS, TOOL_FORMAT } from "./presets";
export type { PresetName, Preset, ToolId, ToolbarLayout } from "./presets";

// ── Storage ───────────────────────────────────────────────────────────────────
export { createRestStorage, createMemoryStorage, kindOf } from "./core/storage";
export type { StorageAdapter, Asset, AssetKind, ListQuery, ListResult, UploadOptions, RestStorageOptions, RestEndpoint } from "./core/storage";

// ── UI pieces, for hosts composing their own layout ──────────────────────────
export { Toolbar, toolAllowed } from "./UI/toolbar/Toolbar";
export {
  Tool, UndoTool, RedoTool, BlockTool, BlockToggleTool, FontTool, SizeTool, MarkTool, ScriptTool, ColorTool, AlignTool,
  ListTool, IndentTool, LinkTool, MediaTool, TableTool, RuleTool, PainterTool, ClearTool, FindTool, PreviewTool, FullscreenTool,
  useToolState, useUI,
} from "./UI/toolbar/tools";
export { ToolButton, PopoverButton, Popover, MenuItem, MenuSeparator, MenuLabel, Modal, Button, Field, Layer, LayerContext, cx } from "./UI/primitives";
export { MediaGallery } from "./UI/media/MediaGallery";
export { LinkDialog, MediaDetailsDialog, PreviewDialog, FindBar, StatusBar } from "./UI/dialogs";
export { FloatBar } from "./UI/FloatBar";

// ── Everything the viewer entry has (document model, HTML, rendering) ───────
export * from "./view-entry";

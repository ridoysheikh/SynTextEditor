"use client";
// Public library exports. The instance returned by `useSynTextEditor` IS the API — no provider, no context, no
// controlled props required; `config` is initial state (plus `value` / `readOnly` / callbacks, kept live).

// ── Styles ────────────────────────────────────────────────────────────────────
import "./styles/globals.lib.css";

// ── The editor ────────────────────────────────────────────────────────────────
export { SynTextEditor, createSynTextEditor, blockFromAsset, LIVE_OPTIONS } from "./SynTextEditor";
export type {
  SynTextEditorConfig, UploadConfig, ThemeMode, ThemeVars, Slot, EventName, Modal as EditorModal, Upload, UIState, LiveOptions,
  ContextMenuConfig, ContextMenuContext, ContextMenuItem, ContextTarget, OpenContextMenu,
} from "./SynTextEditor";

// ── Right-click menu ──────────────────────────────────────────────────────────
export { defaultContextItems, resolveContextItems, pasteFromClipboard, tidy as tidyContextItems, CONTEXT_ITEM_IDS } from "./contextMenu";
export type { ContextItemId } from "./contextMenu";
export { ContextMenu } from "./UI/ContextMenu";
export { useSynTextEditor, useEditorValue, SynEditor } from "./react";
export { EditorView } from "./render";
export type { EditorState } from "./editor/engine";
export { RichEngine } from "./editor/engine";

// ── Presets ───────────────────────────────────────────────────────────────────
export { TOOL_FORMAT } from "./presets";

// ── Storage ───────────────────────────────────────────────────────────────────
export { createRestStorage, createMemoryStorage, kindOf } from "./core/storage";
export type { StorageAdapter, Asset, AssetKind, ListQuery, ListResult, UploadOptions, RestStorageOptions, RestEndpoint } from "./core/storage";

// ── Replaceable parts (the `components` option) ──────────────────────────────
export { SLOT_NAMES } from "./UI/slots";
export type {
  SynComponents, ComponentsConfig, Replacement, SlotName, ButtonProps, ToolButtonProps, PopoverProps, ModalProps,
  MenuItemProps, MenuLabelProps, FieldProps, SliderProps, TooltipProps, ColorPickerProps, ColorMenuProps, EditorPartProps,
  ToolbarProps, StatusBarProps, FloatBarProps, DialogProps, MediaDetailsDialogProps, MediaGalleryProps, ToolProps,
} from "./UI/slots";

// ── UI pieces, for hosts composing their own layout ──────────────────────────
export { Toolbar, toolAllowed } from "./UI/toolbar/Toolbar";
export {
  Tool, UndoTool, RedoTool, BlockTool, BlockToggleTool, FontTool, SizeTool, MarkTool, ScriptTool, ColorTool, AlignTool,
  ListTool, IndentTool, LinkTool, MediaTool, TableTool, RuleTool, PainterTool, ClearTool, FindTool, PreviewTool, FullscreenTool,
  ColorMenu, useToolState, useUI, keys,
} from "./UI/toolbar/tools";
export {
  ToolButton, PopoverButton, Popover, MenuItem, MenuSeparator, MenuLabel, Modal, Button, Field, Slider, Tooltip, Divider,
  Layer, LayerContext, ComponentsContext, overridable, keep, cx,
} from "./UI/primitives";
export { ColorPicker, hexToHsv, hsvToHex, normalizeHex } from "./UI/ColorPicker";
export { MediaGallery } from "./UI/media/MediaGallery";
export { LinkDialog, MediaDetailsDialog, PreviewDialog, FindBar, StatusBar } from "./UI/dialogs";
export { FloatBar } from "./UI/FloatBar";

// ── Everything the viewer entry has (document model, HTML, rendering) ───────
export * from "./view-entry";

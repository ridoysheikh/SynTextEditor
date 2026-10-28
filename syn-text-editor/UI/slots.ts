// ─── Replaceable parts ────────────────────────────────────────────────────────
// Every piece of the editor's UI is a named slot with a library default. The `components` option swaps any of
// them for your own: it gets the same props, plus `Default` — the library's own — to wrap or fall back to.
//
//   useSynTextEditor({ components: { Button: MyButton, Modal: MyModal, tools: { bold: MyBold, ai: AskAI } } })
//
// Define replacements once (module scope or useMemo): a new component identity every render remounts that part.

import type { ButtonHTMLAttributes, ComponentType, CSSProperties, ReactNode, RefAttributes } from "react";
import type { AssetKind } from "../core/storage";
import type { Swatch } from "../core/styles";
import type { ToolbarLayout } from "../presets";
import type { SynTextEditor } from "../SynTextEditor";

/** A replacement: the slot's props plus `Default`, the library's component for that slot. */
export type Replacement<P> = ComponentType<P & { Default: ComponentType<P> }>;

// ── Primitives (used by everything else) ──────────────────────────────────────
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "danger" | "ghost"; size?: "sm" };
export interface ToolButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
  /** Accessible name and tooltip text. */
  label: string;
  /** A shortcut shown in the tooltip. */
  kbd?: string;
  /** Pressed state (toggles); undefined for plain actions. */
  active?: boolean;
  /** Its popover is open. */
  open?: boolean;
  /** Holds a label, not just an icon. */
  wide?: boolean;
}
export interface PopoverProps {
  anchor: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: "start" | "end" | "center";
  className?: string;
  style?: CSSProperties;
  role?: string;
  label?: string;
}
export interface ModalProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  label?: string;
  headExtra?: ReactNode;
}
export interface MenuItemProps {
  children: ReactNode;
  icon?: ReactNode;
  checked?: boolean;
  danger?: boolean;
  kbd?: string;
  disabled?: boolean;
  style?: CSSProperties;
  onSelect: () => void;
}
export interface MenuLabelProps { children: ReactNode }
export interface FieldProps { label: string; children: ReactNode }
export interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  label: string;
  valueText?: string;
  /** A CSS background for the track (e.g. a gradient). */
  track?: string;
  className?: string;
  style?: CSSProperties;
}
export interface TooltipProps { text: string; kbd?: string; /** The hovered control's box, viewport px. */ rect: DOMRect }
export interface ColorPickerProps { initial?: string; onApply: (hex: string) => void; applyLabel?: string }

// ── Parts ─────────────────────────────────────────────────────────────────────
export interface EditorPartProps { editor: SynTextEditor }
export interface ToolbarProps extends EditorPartProps {
  layout: ToolbarLayout;
  className?: string;
  style?: CSSProperties;
  sticky?: boolean;
  wrap?: "wrap" | "scroll";
}
export interface StatusBarProps extends EditorPartProps { className?: string; style?: CSSProperties }
export interface FloatBarProps extends EditorPartProps { surface: HTMLElement | null; scroller: HTMLElement | null }
export interface DialogProps extends EditorPartProps { onClose: () => void }
export interface MediaDetailsDialogProps extends DialogProps { index: number }
export interface MediaGalleryProps extends DialogProps {
  /** Only this kind (set when opened from the image / video / file tool). */
  filter?: AssetKind;
  /** The block index of a media block whose file is being swapped. */
  replace?: number;
}
export interface ColorMenuProps {
  kind: "color" | "highlight";
  title: string;
  /** The palette. */
  list: Swatch[];
  /** The colour at the selection: a palette name or a hex. */
  cur: string | undefined;
  /** A palette name, a hex, or null to clear. Closes the menu. */
  onPick: (c: string | null) => void;
}
export interface ToolProps { editor: SynTextEditor }

export interface SynComponents {
  Button: Replacement<ButtonProps>;
  /** Must pass its ref on to the button: menus anchor to it. */
  ToolButton: ComponentType<ToolButtonProps & RefAttributes<HTMLButtonElement> & { Default: ComponentType<ToolButtonProps & RefAttributes<HTMLButtonElement>> }>;
  Popover: Replacement<PopoverProps>;
  Modal: Replacement<ModalProps>;
  MenuItem: Replacement<MenuItemProps>;
  MenuSeparator: Replacement<object>;
  MenuLabel: Replacement<MenuLabelProps>;
  Field: Replacement<FieldProps>;
  Slider: Replacement<SliderProps>;
  Tooltip: Replacement<TooltipProps>;
  Divider: Replacement<object>;
  ColorPicker: Replacement<ColorPickerProps>;
  ColorMenu: Replacement<ColorMenuProps>;

  Toolbar: Replacement<ToolbarProps>;
  FindBar: Replacement<EditorPartProps>;
  StatusBar: Replacement<StatusBarProps>;
  FloatBar: Replacement<FloatBarProps>;
  ContextMenu: Replacement<EditorPartProps>;
  MediaGallery: Replacement<MediaGalleryProps>;
  LinkDialog: Replacement<DialogProps>;
  MediaDetailsDialog: Replacement<MediaDetailsDialogProps>;
  PreviewDialog: Replacement<DialogProps>;

  /**
   * Toolbar tools by id: replace a built-in (`bold`, `font`, `color`…) or add your own and name it in `toolbar`.
   * A replaced built-in gets `Default`.
   */
  tools: Record<string, ComponentType<ToolProps & { Default?: ComponentType<ToolProps> }>>;
}
export type ComponentsConfig = Partial<SynComponents>;
export type SlotName = Exclude<keyof SynComponents, "tools">;
export const SLOT_NAMES: readonly SlotName[] = [
  "Button", "ToolButton", "Popover", "Modal", "MenuItem", "MenuSeparator", "MenuLabel", "Field", "Slider", "Tooltip",
  "Divider", "ColorPicker", "ColorMenu", "Toolbar", "FindBar", "StatusBar", "FloatBar", "ContextMenu", "MediaGallery",
  "LinkDialog", "MediaDetailsDialog", "PreviewDialog",
];

# Your own components

Every piece of the editor's UI is drawn by the library — no browser widgets — and every piece is a **slot** you can
replace with your own component. Leave a slot alone and you get the library's default; fill it and yours is used,
everywhere that part appears. Change `components` at any time and the editor follows, content and undo kept.

```tsx
import { useSynTextEditor, type ComponentsConfig } from "@syntext/react";

const components: ComponentsConfig = {
  Button: ({ Default, className, ...props }) => <Default {...props} className={`${className} rounded-full`} />,
  Tooltip: ({ text, kbd, rect }) => <MyTooltip text={text} hint={kbd} at={rect} />,
  tools: { stamp: StampTool },
};

function Editor() {
  const editor = useSynTextEditor({ components, toolbar: [["bold", "italic"], ["stamp"]] });
  return editor.render();
}
```

**Define replacements once** — at module scope, or with `useMemo`. A component created inside render is a new
component every render, and React remounts that part each time (an open menu would close).

## Wrap or replace

Each replacement gets the slot's props **plus `Default`**, the library's own component for that slot:

- **Wrap** it to change a little — add a class, a badge, a ring, an extra row — and keep its behaviour:
  ```tsx
  Modal: ({ Default, title, ...p }) => <Default {...p} title={<>{title} <Beta /></>} />
  ```
- **Replace** it entirely by ignoring `Default` and drawing your own from the props:
  ```tsx
  MenuItem: ({ children, icon, checked, kbd, disabled, onSelect }) => (
    <button role="menuitemradio" aria-checked={checked} disabled={disabled}
      onMouseDown={keep} onClick={onSelect} className="my-row">{icon}{children}<kbd>{kbd}</kbd></button>
  )
  ```

`keep` (exported) is `onMouseDown={e => e.preventDefault()}`. Put it on anything clickable that acts on the text, so
clicking it doesn't move the selection out of the editor.

## Slots

### Primitives

Used by everything else — replacing one restyles every place it appears.

| Slot | Props | Used for |
|---|---|---|
| `Button` | `ButtonProps`: button attributes, `tone?: "primary" \| "danger" \| "ghost"`, `size?: "sm"` | buttons in dialogs, the gallery, the find bar |
| `ToolButton` | `ToolButtonProps`: button attributes, `label`, `kbd?`, `active?`, `open?`, `wide?` | every toolbar and floating-bar button. **Must forward its ref** to the button (menus anchor to it) — use `forwardRef`, or render `Default` |
| `Tooltip` | `TooltipProps`: `text`, `kbd?`, `rect` (the hovered button's box) | toolbar tooltips; drawn inside the themed layer — position it `fixed` from `rect` |
| `Popover` | `PopoverProps`: `anchor`, `open`, `onClose`, `children`, `align?`, `className?`, `style?`, `role?`, `label?` | every toolbar menu and picker. Yours must place itself by `anchor` and call `onClose` on Escape / outside click — usually easier to wrap `Default` |
| `MenuItem` | `MenuItemProps`: `children`, `icon?`, `checked?`, `danger?`, `kbd?`, `disabled?`, `style?`, `onSelect` | rows of toolbar menus (styles, fonts, sizes, align, insert, table…) |
| `MenuSeparator` · `MenuLabel` | — · `{ children }` | menu dividers and headings |
| `Modal` | `ModalProps`: `title`, `onClose`, `children`, `footer?`, `width?`, `label?`, `headExtra?` | every dialog. The default traps Tab, closes on Escape and the backdrop, and focuses the first field |
| `Field` | `FieldProps`: `label`, `children` | labelled fields in dialogs |
| `Slider` | `SliderProps`: `value`, `min?`, `max?`, `step?`, `onChange`, `label`, `valueText?`, `track?` | the image width in the details dialog, the hue in the colour picker |
| `Divider` | — | between toolbar groups in a host-built toolbar |
| `ColorPicker` | `ColorPickerProps`: `initial?`, `onApply(hex)`, `applyLabel?` | the custom colour section |
| `ColorMenu` | `ColorMenuProps`: `kind`, `title`, `list` (the palette), `cur`, `onPick(nameOrHexOrNull)` | what the text-colour and highlight tools open |

### Parts

| Slot | Props |
|---|---|
| `Toolbar` | `ToolbarProps`: `editor`, `layout`, `className?`, `style?`, `sticky?`, `wrap?` |
| `FindBar` | `{ editor }` |
| `StatusBar` | `{ editor, className?, style? }` |
| `FloatBar` | `{ editor, surface, scroller }` — the bar over a selected image or table |
| `ContextMenu` | `{ editor }` — read `editor.getUI().contextMenu` (`{ ctx, items }`), close with `editor.closeContextMenu()` |
| `MediaGallery` | `{ editor, onClose, filter?, replace? }` |
| `LinkDialog` · `PreviewDialog` | `{ editor, onClose }` |
| `MediaDetailsDialog` | `{ editor, onClose, index }` |

Parts get the editor instance, so a replacement can use the whole [API](api.md) and hooks — `useEditorValue(editor,
["state"], e => e.getState())`, `useToolState(editor)`, `useUI(editor)`. To change only the rows of the right-click
menu, use [`contextMenu.items`](context-menu.md) instead.

### Tools

`components.tools` maps tool ids to components taking `{ editor }`:

- **A built-in id** (`bold`, `font`, `color`, `table`…) replaces that tool; it gets `Default`, the library's tool.
- **A new id** adds a tool — name it in [`toolbar`](configuration.md#toolbar-and-frame) where you want it.

```tsx
import { BadgeCheck } from "lucide-react";
import { ToolButton, useEditorValue, useToolState, type ComponentsConfig } from "@syntext/react";

const components: ComponentsConfig = {
  tools: {
    stamp: ({ editor }) => {
      const { off } = useToolState(editor);                  // disabled while read-only
      return <ToolButton label="Approved" disabled={off} onClick={() => editor.insertText("✓ Approved ")}><BadgeCheck /></ToolButton>;
    },
    words: ({ editor }) => <span>{useEditorValue(editor, ["change"], (e) => e.getWords())} words</span>,
    bold: ({ editor, Default }) => <span className="ring-on-active">{Default && <Default editor={editor} />}</span>,
  },
};

useSynTextEditor({ components, toolbar: [["undo", "redo"], ["bold", "italic"], ["stamp", "words"]] });
```

## Changing them live

`components` is a [live option](configuration.md#controlled-options): pass a different object (a theme switch, a
feature flag) and the editor redraws with it — the document, selection and undo history stay. Outside React:
`editor.setOptions({ components })`.

## Outside the editor

Tools and primitives rendered outside `editor.render()` — a [toolbar of your own](customization.md#your-own-toolbar)
— don't see the editor's `components`. Give them the same set with the context:

```tsx
import { ComponentsContext } from "@syntext/react";

<ComponentsContext.Provider value={components}>
  <MyToolbar editor={editor} />
</ComponentsContext.Provider>
```

`overridable(name, Component)` makes a slot of your own component — what the library uses for each part.
`SLOT_NAMES` lists every slot.

## Styling without replacing

Often a class is enough: every part has `se-*` classes ([reference](customization.md#class-name-reference)), `classNames` /
`styles` reach the main parts ([Configuration](configuration.md#look)), and every colour and size is a
[`--se-*` variable](theming.md).

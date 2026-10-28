# The right-click menu

Right-clicking in the editor opens its own menu, with the actions that fit what was clicked. You decide whether it
shows, which rows it has, and what they do.

| Right-click on | Default rows |
|---|---|
| text | Cut, Copy, Paste, Paste as plain text · Format ▸ · Turn into ▸ · Add link… · Insert ▸ · Select all |
| a link | the text rows, plus Edit link…, Open link, Copy link address, Remove link |
| a table cell | Cut, Copy, Paste… · Format ▸ · link rows · Insert row / column ▸ · Delete row / column / table ▸ · Header row |
| an image or video | Cut, Copy · Align ▸ · Width ▸ · Alt text and caption… · Replace… · Open in new tab · Copy address · Move up / down · Delete |
| a file | Cut, Copy · Rename… · Replace… · Open · Copy address · Move up / down · Delete |
| a rule or a whole table | Cut, Copy · (table rows) · Move up / down · Delete |

Rows are kept to what the editor allows: a `basic` editor's Format menu has only bold, italic, underline and strike,
and it has no Turn into or Insert. A read-only editor offers Copy, Select all and the link rows.

Right-clicking an image, file or table selects it first, so the menu acts on it. Right-clicking inside selected text
keeps the selection.

**Opening it:** right-click, the keyboard's Menu key, or Shift+F10 (opens at the caret). **Shift + right-click**
opens the browser's own menu instead (spell-check suggestions live there).
**In the menu:** ↑ ↓ move, → opens a submenu, ← closes it, Enter or Space chooses, a letter jumps to the next row
starting with it, Esc closes. Any other key closes the menu and goes to the editor.

## Turning it off

```ts
useSynTextEditor({ contextMenu: false });   // the browser's own menu everywhere
```

## Choosing rows by id

A list of ids picks rows and sets their order. Ids for rows inside submenus (like `bold`, in Format) lift them to
the top level. Ids that don't apply to what was clicked are skipped, and separators tidy themselves.

```ts
useSynTextEditor({
  contextMenu: { items: ["bold", "italic", "link", "separator", "copy", "paste", "delete"] },
});
```

| Ids | |
|---|---|
| `cut` `copy` `paste` `pastePlain` `selectAll` | clipboard |
| `format` (submenu) · `bold` `italic` `underline` `strike` `code` `sup` `sub` `clear` | formatting |
| `turnInto` (submenu) · `p` `h1` `h2` `h3` `h4` `quote` `code` `bullet` `ordered` `check` | block kind and lists |
| `link` `openLink` `copyLink` `removeLink` | links |
| `insert` (submenu) · `image` `video` `file` `table` `hr` | inserting |
| `align` `width` `details` `replace` `openFile` `copyAddress` | images, video, files |
| `moveUp` `moveDown` `delete` | any image, video, file, rule or table |
| `tableInsert` (submenu) · `rowAbove` `rowBelow` `colLeft` `colRight` | tables |
| `tableDelete` (submenu) · `deleteRow` `deleteCol` `deleteTable` · `header` | tables |
| `separator` | a divider |

(`code` appears in both Format and Turn into; a list picks the first, inline code.) The full list is exported as
`CONTEXT_ITEM_IDS`.

## Full control with a function

`items` as a function gets the context and the default rows, and returns the rows to show. Filter, reorder,
relabel, or add your own.

```tsx
import { CalendarDays, Sparkles } from "lucide-react";

useSynTextEditor({
  contextMenu: {
    items: (ctx, defaults) => {
      if (ctx.target === "image") return defaults;                       // images: as they are
      return [
        ...defaults.filter((row) => row === "separator" || row.id !== "selectAll"),
        "separator",
        {
          id: "date",
          label: "Insert today's date",
          icon: <CalendarDays />,
          disabled: ctx.readOnly,
          onSelect: ({ editor }) => editor.insertText(new Date().toLocaleDateString()),
        },
        {
          id: "assistant",
          label: "Ask the assistant",
          icon: <Sparkles />,
          items: [                                                         // a submenu
            { id: "shorter", label: "Make shorter", onSelect: ({ editor }) => rewrite(editor, "shorter") },
            { id: "formal", label: "More formal", onSelect: ({ editor }) => rewrite(editor, "formal") },
          ],
        },
      ];
    },
  },
});
```

Return an empty list (or `null`) and no editor menu opens — the browser's own shows instead. That's how to keep the
editor's menu for some targets only:

```ts
contextMenu: { items: (ctx, defaults) => (ctx.target === "text" && !ctx.hasSelection ? [] : defaults) }
```

`items` is read each time the menu opens, so it can close over component state — no memoising needed.

### A row

```ts
type ContextMenuItem = "separator" | {
  id: string;
  label: string;
  icon?: ReactNode;        // 14px works best; lucide icons fit
  kbd?: string;            // a shortcut shown on the right
  disabled?: boolean;
  checked?: boolean;       // a tick, for toggles
  danger?: boolean;        // red, for destructive rows
  onSelect?: (ctx: ContextMenuContext) => void;   // the menu has already closed
  items?: ContextMenuItem[];                      // a submenu instead of an action
};
```

### The context

```ts
interface ContextMenuContext {
  editor: SynTextEditor;
  target: "text" | "link" | "image" | "video" | "file" | "rule" | "table" | "cell";
  hasSelection: boolean;   // text is selected, not just a caret
  link: string | null;     // the link under the pointer or around the caret
  index: number | null;    // block index of the image / video / file / rule / table
  block: Block | null;     // that block (src, alt, width, rows…)
  cell: { b: number; r: number; c: number } | null;
  readOnly: boolean;
  x: number; y: number;    // where the menu opens
}
```

Inside a row, act through `ctx.editor` — `insertText`, `toggleBold`, `setColor`, `openGallery`… — and, for images
and tables, `ctx.editor.engine` (`updateAtom(patch, ctx.index)`, `removeAtom(ctx.index)`, `addRow(1)`…). See the
[API reference](api.md).

## From code

```ts
editor.openContextMenu();                    // at the caret
editor.openContextMenu(x, y);                // at a point (viewport px)
editor.openContextMenu(x, y, element);       // as a right-click on that element would
editor.closeContextMenu();
editor.on("contextmenu", (ctx) => analytics.track("menu", { target: ctx.target }));
```

`openContextMenu` returns `false` when nothing opened (the menu is off, or its rows came back empty).

The rows can be reused elsewhere — `defaultContextItems(ctx)` gives the defaults, `resolveContextItems(ctx)` the
defaults with the editor's `contextMenu.items` applied, and `pasteFromClipboard(editor, plain?)` is the paste the
menu uses.

## Clipboard notes

Cut and Copy go through the editor's own clipboard handling, so pasting into another SynTextEditor keeps everything.
**Paste** from a menu has to read the clipboard through the browser's Clipboard API: Chrome and Edge ask the user
for permission the first time; Firefox and Safari may refuse. When it's refused, the editor reports it through
`onError` (and the `error` event) with a hint to use Ctrl/⌘+V — keyboard paste always works.

## Styling

The menu is a `.se-popover.se-ctx` in the editor's layer; submenus add `.se-ctx-sub`. Rows are `.se-menu-item`
with `.se-ctx-icon`, `.se-ctx-label`, `.se-ctx-check`, `.se-menu-kbd` and `.se-ctx-more` (the submenu chevron);
`[data-focus]` is the highlighted row, `[aria-expanded="true"]` a row whose submenu is open, `[data-danger]` a
destructive one. Sizes follow `--se-menu-pad` and `--se-menu-item-pad` ([Theming](theming.md#spacing)).

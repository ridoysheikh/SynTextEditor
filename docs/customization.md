# Customization

- [Presets and formats](#presets-and-formats) — what an editor allows
- [Toolbar layout](#toolbar-layout) — which tools, in which groups
- [Your own toolbar](#your-own-toolbar) — the exported tools and primitives
- [Palettes, fonts and sizes](#palettes-fonts-and-sizes)
- [Custom fonts](#custom-fonts)
- [Variants and frame](#variants-and-frame)
- [Class-name reference](#class-name-reference) — every element, for CSS overrides

For colours and spacing, see [Theming](theming.md).

## Presets and formats

A preset is two things: the **formats** (what a document in this editor may contain) and the **toolbar**.

| Format | Preset: full | standard | basic | minimal |
|---|:-:|:-:|:-:|:-:|
| `bold` `italic` | ✓ | ✓ | ✓ | ✓ |
| `link` | ✓ | ✓ | ✓ | ✓ |
| `underline` `strike` | ✓ | ✓ | ✓ | |
| `bullet` `ordered` `indent` | ✓ | ✓ | ✓ | |
| `code` (inline code and code blocks) | ✓ | ✓ | | |
| `color` `highlight` `size` | ✓ | ✓ | | |
| `h1` `h2` `h3` `quote` | ✓ | ✓ | | |
| `align` `hr` `image` | ✓ | ✓ | | |
| `h4` `check` | ✓ | | | |
| `script` (sub/sup) `font` | ✓ | | | |
| `video` `file` `table` | ✓ | | | |

`p` (paragraph) is always allowed. The `code` format covers both inline code and code blocks.

**Formats are enforced, not just hidden.** The schema decides what the toolbar shows, what keyboard shortcuts and
markdown starts do, what survives a paste from Word or a web page, what `insertHTML` keeps, and what `toDoc` keeps
when it reads a stored value. A heading pasted into a `basic` editor arrives as a paragraph; a pasted table
becomes tab-separated lines; disallowed images are dropped.

```ts
// Your own set
useSynTextEditor({ formats: ["bold", "italic", "h2", "h3", "bullet", "ordered", "check", "link", "image", "table"] });
```

All format names: `bold italic underline strike code script size font color highlight link p h1 h2 h3 h4 quote
bullet ordered check align indent hr image video file table`.

## Toolbar layout

`toolbar` is a list of groups; each group is a list of tool ids, with a divider between groups.

```ts
useSynTextEditor({
  toolbar: [
    ["undo", "redo"],
    ["block", "size"],
    ["bold", "italic", "underline"],
    ["bullet", "ordered", "check"],
    ["link", "image", "table"],
  ],
});
```

A tool whose format isn't allowed is dropped from the bar (and an emptied group with it), so you can pass the full
layout to a restricted editor safely.

| Id | Control | Needs format |
|---|---|---|
| `undo` `redo` | history | — |
| `block` | text style menu: paragraph, headings, quote, code block | any of `h1`–`h4`, `quote`, `code` |
| `font` | font menu | `font` |
| `size` | − / size box / sizes menu / + | `size` |
| `bold` `italic` `underline` `strike` `code` | marks | the same name |
| `sub` `sup` | sub/superscript | `script` |
| `color` `highlight` | palette + custom colour | `color` / `highlight` |
| `align` | alignment menu (also aligns a selected image) | `align` |
| `bullet` `ordered` `check` | lists | the same name |
| `outdent` `indent` | list nesting | `indent` |
| `quote` `codeblock` | block toggles | `quote` / `code` |
| `link` | link dialog | `link` |
| `image` `video` `file` | the media library, filtered | the same name |
| `media` | menu: image / video / file / browse | any of `image`, `video`, `file` |
| `table` | size picker | `table` |
| `hr` | horizontal rule | `hr` |
| `painter` | copy / apply formatting | — |
| `clear` | clear formatting | — |
| `find` | find & replace bar | — |
| `status` | compact word count (characters in its tooltip, `n / max` with `maxLength`) and upload progress — the status bar as a toolbar tool | — |
| `spacer` | a flexible gap: the groups after it sit at the right edge. Put it alone in its group: `["spacer"]` | — |
| `preview` | preview dialog (rendered, HTML, JSON) | — |
| `fullscreen` | full screen | — |

`toolbar: false` hides the bar; keyboard shortcuts still work. Other frame options: `stickyToolbar`,
`toolbarWrap: "scroll"` ([Configuration](configuration.md#toolbar-and-frame)).

## Your own toolbar

Every tool is an exported component that takes the editor instance, so you can lay out a bar in your own markup —
above the editor, in a page header, in a sidebar.

```tsx
import {
  useSynTextEditor, UndoTool, RedoTool, BlockTool, MarkTool, ColorTool, ListTool, LinkTool, MediaTool, ToolButton,
} from "@syntext/react";
import { Sparkles } from "lucide-react";

function Composer() {
  const editor = useSynTextEditor({ toolbar: false, preset: "standard" });
  return (
    <>
      <div className="se-scope flex items-center gap-1 rounded-lg border p-1">
        <UndoTool editor={editor} /><RedoTool editor={editor} />
        <BlockTool editor={editor} />
        <MarkTool editor={editor} mark="bold" /><MarkTool editor={editor} mark="italic" />
        <ColorTool editor={editor} kind="color" />
        <ListTool editor={editor} kind="bullet" />
        <LinkTool editor={editor} />
        <MediaTool editor={editor} kind="image" />
        <ToolButton label="Rewrite" onClick={() => rewrite(editor)}><Sparkles /></ToolButton>
      </div>
      {editor.render()}
    </>
  );
}
```

`se-scope` gives the wrapper the editor's variables, so the tools are sized and coloured like the built-in bar.

| Component | Props |
|---|---|
| `Tool` | `id: ToolId` — any tool by id |
| `UndoTool` `RedoTool` `FontTool` `SizeTool` `AlignTool` `LinkTool` `TableTool` `RuleTool` `PainterTool` `ClearTool` `FindTool` `PreviewTool` `FullscreenTool` | — |
| `BlockTool` | — (menu) |
| `BlockToggleTool` | `type: "quote" \| "code"` |
| `MarkTool` | `mark: "bold" \| "italic" \| "underline" \| "strike" \| "code"` |
| `ScriptTool` | `script: "sub" \| "sup"` |
| `ColorTool` | `kind: "color" \| "highlight"` |
| `ListTool` | `kind: "bullet" \| "ordered" \| "check"` |
| `IndentTool` | `delta: 1 \| -1` |
| `MediaTool` | `kind: "image" \| "video" \| "file" \| "media"` |
| `Toolbar` | `layout`, `className?`, `style?`, `sticky?`, `wrap?` — the built-in bar, placed anywhere |

All take `editor`. Building blocks for your own controls:

| Primitive | |
|---|---|
| `ToolButton` | a toolbar button: `label` (tooltip and aria-label), `kbd?`, `active?`, plus button props. Keeps the editor's selection when clicked. |
| `PopoverButton` | a button with a panel: `label`, `icon`, `children: (close) => ReactNode` |
| `Popover` | a positioned panel: `anchor`, `open`, `onClose` |
| `MenuItem` `MenuSeparator` `MenuLabel` | menu rows |
| `Modal` | a dialog: `title`, `onClose`, `footer?`, `width?` |
| `Button` `Field` | dialog controls: `tone?: "primary" \| "danger" \| "ghost"`, `size?: "sm"` |
| `Slider` | a drawn range control: `value`, `min`, `max`, `step`, `onChange`, `label`, `valueText?`, `track?` (a CSS background for the track, e.g. a gradient). Drag, click, ← → ↑ ↓, Page Up / Down, Home / End |
| `ColorPicker` | the drawn colour picker: `initial?`, `onApply(hex)`, `applyLabel?` — saturation square, hue slider, hex field; `hexToHsv`, `hsvToHex`, `normalizeHex` are exported too |
| `useToolState(editor)` | `{ state, off }` — the editor's [state](api.md#editorstate) and whether tools should be disabled |
| `useUI(editor)` | open dialogs, find bar, fullscreen, uploads |

Your own buttons must not take focus from the editor on mouse-down, or the selection is lost. `ToolButton` handles
this; for plain buttons add `onMouseDown={(e) => e.preventDefault()}`.

The dialogs and bars are exported too — `MediaGallery`, `LinkDialog`, `MediaDetailsDialog`, `PreviewDialog`,
`FindBar`, `StatusBar`, `FloatBar` — but usually you open them through the instance (`editor.openGallery()`,
`editor.openLink()`, `editor.toggleFind()`…).

## Palettes, fonts and sizes

```ts
useSynTextEditor({
  colors: [
    { name: "brand", label: "Brand", hex: "#7c3aed" },   // stored as "brand" → var(--se-c-brand)
    { name: "red", label: "Red", hex: "#e03131" },
  ],
  highlights: [{ name: "brand", label: "Brand tint", hex: "#ede9fe" }],   // → var(--se-hl-brand)
  fonts: [
    { label: "Body", value: "Inter, system-ui, sans-serif" },
    { label: "Display", value: "'Playfair Display', Georgia, serif" },
  ],
  sizes: [12, 14, 16, 20, 28, 40],
});
```

```css
.se-root, .se-layer, .se-content { --se-c-brand: #7c3aed; --se-hl-brand: #ede9fe; }
.dark .se-root, .dark .se-layer, .dark .se-content { --se-c-brand: #a78bfa; --se-hl-brand: #2e1065; }
```

| Option | Item | Default |
|---|---|---|
| `colors` | `{ name, label, hex }` — `name`: lowercase letters, digits, `-` | gray, red, orange, yellow, green, teal, blue, purple, pink |
| `highlights` | same | yellow, green, teal, blue, purple, pink, red, orange, gray |
| `fonts` | `{ label, value, src? }` — `value` is a CSS `font-family` stack, stored as-is; or `{ add: [...] }` | Sans (Inter), Serif (Georgia), Mono, Arial, Times, Courier, Verdana |
| `sizes` | px | 10, 11, 12, 13, 14, 15, 16, 18, 20, 24, 28, 32, 36, 48, 64 |

`hex` is used in the swatch fallback and in inline-mode HTML. Font sizes can always be typed (8–96px). The custom
colour picker stores hex values.

## Custom fonts

Push your own fonts onto the menu with `{ add }` — the defaults stay, yours come after (one with the same `value` as
a default replaces it). Give a font a `src` and the editor loads it; without one, the page must already load it.

```ts
useSynTextEditor({
  fonts: {
    add: [
      // a stylesheet: Google Fonts, Bunny Fonts, your own CSS
      { label: "Playfair", value: "'Playfair Display', Georgia, serif",
        src: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400..900&display=swap" },
      // one font file
      { label: "Brand", value: "'Brand Sans', system-ui, sans-serif", src: "/fonts/brand-sans.woff2" },
      // files by weight and style
      { label: "Brand Serif", value: "'Brand Serif', Georgia, serif", src: [
        { url: "/fonts/brand-serif.woff2", weight: 400 },
        { url: "/fonts/brand-serif-bold.woff2", weight: 700 },
        { url: "/fonts/brand-serif-italic.woff2", weight: 400, style: "italic" },
        // a variable font: { url: "/fonts/brand-serif-var.woff2", weight: "100 900" }
      ] },
    ],
  },
});

fonts: [{ label: "Body", value: "Inter, sans-serif" }, …]   // a list replaces the defaults instead
```

| `src` | Loaded as |
|---|---|
| a URL ending in `.woff2` `.woff` `.ttf` `.otf` | an `@font-face` named after the first family in `value` |
| any other URL | a `<link rel="stylesheet">` — it must declare the family named in `value` |
| `{ url, weight?, style? }[]` | one `@font-face` per file; `weight` is `400`, `"700"` or a range `"100 900"` |

Each stylesheet and face goes into `<head>` once (`link[data-se-font]`, `style[data-se-fonts]`), however many editors
use it. URLs may be `https:`, a path, `blob:` or a base64 `data:font/…`. Files from another origin need CORS headers.

**At runtime:** `editor.addFonts(font, …)` pushes onto the menu and loads them — e.g. after a user uploads a font.
(With the hook, the `fonts` prop wins when it changes; keep pushed fonts in your state and pass them through it.)

**Showing documents:** documents store only the `value` stack. Give the viewer the same option and it loads the
faces the document uses — server-rendered as a `<link>` / `<style>`:

```tsx
<SynTextView value={doc} fonts={BRAND_FONTS} />
```

For HTML elsewhere (an email, another app), `fontFaceCSS(fonts)` returns the `@font-face` rules and
`fontStylesheets(fonts)` the stylesheet URLs; `usedFonts(fonts, doc.blocks)` keeps only those a document uses, and
`loadFonts(fonts)` loads them into the page yourself.

## Variants and frame

| `variant` | Look |
|---|---|
| `"default"` | a bordered box with toolbar and surface |
| `"borderless"` | no border, background or toolbar fill — sits inside your own card |
| `"document"` | a page (`--se-page-width`, `--se-page-pad`) on a desk (`--se-surface`), for long-form writing |

Sizing: `minHeight`, `maxHeight` (the surface scrolls, the toolbar stays), `stickyToolbar`. Full screen is a
toolbar button or `editor.toggleFullscreen()`; Escape leaves it.

## Class-name reference

Every element the library draws, for overrides that variables don't cover. Scope your selectors under
`.se-root`, `.se-layer` or `.se-content` as the library does.

### The editor frame

| Selector | Element |
|---|---|
| `.se-root` | the editor. `[data-variant]`, `[data-fullscreen]`, `[data-disabled]` (read-only); theme classes `se-dark` `se-light` `se-auto`, `se-comfortable` |
| `.se-toolbar` | the toolbar. `[data-sticky]`, `[data-wrap="wrap"\|"scroll"]` |
| `.se-tb-group` | a group of tools (`+ .se-tb-group` draws the divider) |
| `.se-btn` | a tool button. `[aria-pressed="true"]` active, `[data-open]` its menu is open, `[data-wide]` a labelled menu button |
| `.se-btn-label`, `.se-caret` | label and chevron inside menu buttons |
| `.se-swatch-bar` | the colour bar under the colour / highlight icons |
| `.se-size-input` | the font size box |
| `.se-findbar`, `.se-findbar-count` | the find & replace bar |
| `.se-scroll` | the scrolling area around the surface |
| `.se-surface` | the editable element (also `.se-content`). `[data-empty]` with `[data-placeholder]` |
| `.se-float` | the floating bar over a selected image or table |
| `.se-statusbar` | the status bar; `.se-progress`, `.se-progress-track`, `.se-progress-fill` for uploads |

### The document (editor and viewer)

| Selector | Element |
|---|---|
| `.se-content` | the document root |
| `.se-blk` | every block |
| `.se-p` `.se-h1` `.se-h2` `.se-h3` `.se-h4` `.se-quote` `.se-code` | text blocks |
| `.se-li` + `.se-li-bullet` / `.se-li-ordered` / `.se-li-check` | list items. `[data-indent="0"…"6"]`, `[data-marker]` (the bullet or number, drawn by `::before`), `[data-checked]` |
| `[data-align="center"\|"right"\|"justify"]` | aligned blocks (and `left`/`right` on media) |
| `.se-b` `.se-i` `.se-u` `.se-s` | bold, italic, underline, strike |
| `.se-icode` | inline code |
| `.se-hl` | highlighted text (colour inline) |
| `.se-link` | links |
| `.se-hr` | horizontal rule block |
| `.se-image`, `.se-video` → `.se-figure` → `img`/`video`, `.se-caption` | media |
| `.se-file` → `.se-file-link` → `.se-file-name`, `.se-file-size` | a file attachment |
| `.se-table` (block) → `table.se-table` → `th`, `td` | a table. Cells may have `[data-align]` |
| `.se-list` | `<ul>`/`<ol>` in class-mode HTML from `toHTML` |

Editor only: `.se-surface > [data-selected]` is the selected image / table / rule, `.se-resize` the resize handle.
Text colours, highlights, sizes and fonts are inline styles on the span.

### Menus and dialogs

| Selector | Element |
|---|---|
| `.se-layer` | the portalled wrapper (carries theme classes and `vars`) |
| `.se-popover` | a menu or popover panel |
| `.se-menu-item` (`[aria-checked]`, `[data-danger]`), `.se-menu-text`, `.se-menu-kbd`, `.se-menu-sep`, `.se-menu-label` | menu rows |
| `.se-colors`, `.se-colors-hover`, `.se-swatches`, `.se-swatch` (`[data-none]`) | colour menus |
| `.se-picker`, `.se-sv`, `.se-sv-thumb`, `.se-picker-row`, `.se-picker-chip` | the custom colour picker |
| `.se-player`, `.se-pl-big`, `.se-pl-bar`, `.se-pl-btn`, `.se-pl-seek`, `.se-pl-vol`, `.se-pl-rate`, `.se-thumb` | the [video player](video.md) and the thumbnail picker |
| `.se-slider`, `.se-slider-track`, `.se-slider-fill`, `.se-slider-thumb` (`[data-track]` for a painted track) | sliders |
| `.se-grid-pick`, `.se-grid-cell`, `.se-grid-caption` | table size picker |
| `.se-tip` | tooltip |
| `.se-backdrop` → `.se-modal` → `.se-modal-head` / `.se-modal-title` / `.se-modal-body` / `.se-modal-foot` | dialogs |
| `.se-tabs`, `.se-tab[aria-selected]` | dialog tabs |
| `.se-input`, `.se-field`, `.se-button[data-tone][data-size]`, `.se-seg` | fields, buttons, segmented controls |
| `.se-gallery`, `.se-gallery-bar`, `.se-tile` (`.se-tile-thumb`, `.se-tile-meta`, `.se-tile-name`, `.se-tile-sub`, `.se-tile-check`, `.se-tile-kind`) | media library grid |
| `.se-detail` | details of the selected file |
| `.se-drop`, `.se-uploads`, `.se-upload-row` | upload area and progress |
| `.se-preview-frame`, `.se-source` | preview dialog |
| `.se-empty`, `.se-hint`, `.se-error` | empty states and messages |

Example — a pill-shaped toolbar and larger dialog titles:

```css
.se-root .se-btn { border-radius: 999px; }
.se-layer .se-modal-title { font-size: 16px; }
.se-content .se-quote { border-left-width: 4px; font-style: italic; }
```

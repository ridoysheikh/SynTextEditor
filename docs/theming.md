# Theming

Every colour, size and space the editor uses is a CSS variable named `--se-*`. Change a variable and everything
that uses it follows: the toolbar, the menus and dialogs, the document, and the viewer.

- [Where variables live](#where-variables-live)
- [Ways to theme](#ways-to-theme) — CSS, wrapper classes, `vars`, `classNames` / `styles`, Tailwind
- [Theme modes](#theme-modes) — light, dark, auto, inherit
- [Density](#density) — compact and comfortable
- [Variable reference](#variable-reference) — colours, palette, spacing, type
- [Recipes](#recipes)

## Where variables live

| Element | Is | Gets variables from |
|---|---|---|
| `.se-root` | the editor | `theme.css` / `layout.css`, your CSS, `vars` |
| `.se-layer` | a menu, popover, tooltip or dialog, portalled to `<body>` | a copy of the editor's theme class and `vars`, applied by the library |
| `.se-content` | a document — the editor's writing surface, or a `SynTextView` | its editor when inside one; its own declarations when standalone |
| `.se-scope` | any wrapper you add | the same defaults — use it around editor tools you place outside the editor |

Menus and dialogs are rendered in `<body>` so they escape `overflow: hidden` parents. They still match the editor:
the library gives each layer the editor's theme class, its `vars`, and — when the editor inherits dark mode from a
`.dark` ancestor — `se-dark`. So when you theme with CSS, **target `.se-layer` as well as `.se-root`**.

## Ways to theme

### 1. CSS variables

```css
.se-root, .se-layer {
  --se-accent: #e11d48;
  --se-accent-hover: #be123c;
  --se-radius: 10px;
}
```

To leave out `theme.css` entirely, declare every colour in the [reference](#colours) yourself.

### 2. Wrapper classes (a "subclass" theme)

Define a theme as a class, then put it on the editor and on its layer (menus and dialogs live in `<body>`, so they
can't see your page's ancestors — `classNames.layer` puts the class on them).

```css
.se-root.brand-forest, .se-layer.brand-forest {
  --se-accent: #15803d;
  --se-bg: #fbfdf9;
  --se-surface: #eef5ea;
  --se-content-font: Georgia, "Times New Roman", serif;
}
```

```ts
useSynTextEditor({ classNames: { root: "brand-forest", layer: "brand-forest" } });
```

A theme keyed to an ancestor (`.brand-forest .se-root`) also works for the editor itself; give the layer the class
through `classNames.layer` as above, or use `vars` (option 3), which reach both automatically.

Your own classes can also extend the defaults for one editor without touching others:

```css
.se-root.notes-editor { --se-content-size: 16px; --se-pad-x: 24px; }
```

```ts
useSynTextEditor({ classNames: { root: "notes-editor" } });
```

### 3. `vars` — inline, per editor

```ts
useSynTextEditor({
  vars: {
    accent: "#e11d48",            // → --se-accent
    "accent-hover": "#be123c",    // → --se-accent-hover
    radius: "12px",
    "content-font": "Georgia, serif",
    "--se-c-red": "#ff0044",      // full names work too
  },
});
```

`vars` are set as inline styles on the editor and copied onto its menus and dialogs. Inline styles win over any
stylesheet, so `vars` beat CSS for that one editor.

### 4. `classNames` and `styles` — per part

For anything that isn't a variable: shadows, widths, margins, borders. Tailwind classes work here.

```ts
useSynTextEditor({
  classNames: {
    root: "shadow-xl rounded-2xl",   // the outer box
    toolbar: "px-3",                 // the toolbar
    surface: "min-h-64 text-[17px]", // the writing area (also has .se-content)
    statusbar: "hidden md:flex",
  },
  styles: { root: { maxWidth: 820, marginInline: "auto" } },
});
```

Parts: `root`, `toolbar`, `surface`, `content` (the same element as `surface`), `statusbar`, and `layer` — the
wrapper of the menus, tooltips and dialogs (give it classes that set variables, not layout: it has no box of its
own). For everything else, use the [class-name reference](customization.md#class-name-reference).

The `className` and `style` you pass to `editor.render({ className, style })` go on the root too.

### 5. Tailwind

The editor needs no Tailwind. If you use Tailwind v4, add its colours to your utilities:

```css
/* app/globals.css */
@import "tailwindcss";
@import "@syntext/react/tailwind";
```

Now `bg-se-surface`, `text-se-accent`, `border-se-border`, `text-se-text-2`… follow the editor's theme in your own UI
(available: `bg`, `surface`, `surface-2`, `border`, `text`, `text-2`, `muted`, `accent`, `danger`).

Going the other way — the editor following your Tailwind / shadcn theme — map its variables onto yours:

```css
.se-root, .se-layer {
  --se-bg: var(--background);
  --se-surface: var(--muted);
  --se-border: var(--border);
  --se-text: var(--foreground);
  --se-text-2: var(--muted-foreground);
  --se-accent: var(--primary);
  --se-accent-fg: var(--primary-foreground);
  --se-popover: var(--popover);
  --se-dialog: var(--background);
  --se-radius: var(--radius);
}
```

## Theme modes

```ts
useSynTextEditor({ theme: "inherit" });   // default
```

| `theme` | Class on the editor | Dark when |
|---|---|---|
| `"inherit"` | none | an ancestor has `.dark` (Tailwind's class strategy, next-themes) |
| `"light"` | `se-light` | never — stays light inside a dark page |
| `"dark"` | `se-dark` | always |
| `"auto"` | `se-auto` | the system prefers dark (`prefers-color-scheme`) |

The viewer takes `theme="light" | "dark" | "inherit"`. Dark values are the second column of the
[colour reference](#colours); override them under the same selectors:

```css
.dark .se-root:not(.se-light), .dark .se-layer:not(.se-light), .se-root.se-dark, .se-layer.se-dark {
  --se-accent: #fb7185;
}
```

## Density

```ts
useSynTextEditor({ density: "comfortable" });   // default "compact"
<SynTextView value={doc} density="comfortable" />
```

Density switches the [spacing variables](#spacing) as a set (class `se-comfortable`). For anything in between,
override the individual variables.

## Variable reference

### Colours

Defined in `theme.css` on `.se-root`, `.se-layer`, `.se-scope` and standalone `.se-content`.

| Variable | Light | Dark | Used for |
|---|---|---|---|
| `--se-bg` | `#ffffff` | `#121318` | the writing surface, the page in `document` |
| `--se-surface` | `#f7f8fa` | `#181a20` | toolbar, status bar, the desk in `document`, tiles |
| `--se-surface-2` | `#eceef2` | `#23262e` | hover |
| `--se-border` | `#e3e6eb` | `#262932` | outer border, dividers |
| `--se-border-2` | `#d3d8e0` | `#343844` | focused border, menus, rules |
| `--se-text` | `#16181d` | `#eceef2` | text |
| `--se-text-2` | `#5f6672` | `#a3aab6` | secondary text, icons at rest, list markers |
| `--se-muted` | `#9aa1ad` | `#69707d` | placeholder, disabled |
| `--se-accent` | `#2f6bff` | `#6d8dff` | active tools, focus, selection, primary buttons, checkboxes |
| `--se-accent-hover` | `#1f56e0` | `#8aa3ff` | primary button hover |
| `--se-accent-fg` | `#ffffff` | `#0d0f14` | text on the accent |
| `--se-danger` | `#e03131` | `#ff6b6b` | delete actions, errors, over the length limit |
| `--se-success` | `#2f9e44` | `#51cf66` | — (for your own use) |
| `--se-popover` | `#ffffff` | `#1b1d24` | menus, popovers, floating bar |
| `--se-dialog` | `#ffffff` | `#16181e` | dialogs |
| `--se-backdrop` | `rgba(15,18,25,.45)` | `rgba(0,0,0,.6)` | behind a dialog |
| `--se-field` | `#ffffff` | `#111216` | inputs |
| `--se-field-border` | `#d3d8e0` | `#343844` | input borders |
| `--se-selected` | accent at 10% | same | pressed tools, selected rows |
| `--se-ring` | accent at 40% | same | focus rings |
| `--se-shadow` | soft two-layer | deeper | menus, dialogs |
| `--se-link` | `var(--se-accent)` | same | links in documents |
| `--se-code-bg` | `#f1f3f5` | `#23262e` | inline code background |
| `--se-code-text` | `#c2255c` | `#f783ac` | inline code text |
| `--se-pre-bg` | `#f6f8fa` | `#1a1c22` | code blocks, HTML/JSON in preview |
| `--se-quote-bar` | `#d3d8e0` | `#3d4250` | quote bar |
| `--se-quote-text` | `#5f6672` | `#a3aab6` | quote text |
| `--se-table-border` | `#d3d8e0` | `#343844` | table lines |
| `--se-table-head` | `#f4f6f8` | `#1d2027` | header row |
| `--se-find` | `#ffe066` | `#8f6b00` | find matches |
| `--se-selection` | accent at 22% | same | selected text |
| `--se-scrollbar` | `#d5d9e0` | `#3a3e49` | scrollbar thumb |
| `--se-scrollbar-hover` | `#b4bbc6` | `#555b68` | scrollbar thumb, hovered |

### Palette

Palette colours are stored in documents **by name** — `{ color: "red" }` — and drawn as `var(--se-c-red)`. Change a
variable and every document that uses it changes, including ones saved long ago. Colours picked with the custom
picker are stored as hex and don't change with the theme.

| Name | `--se-c-*` light | dark | `--se-hl-*` light | dark |
|---|---|---|---|---|
| `gray` | `#6b7280` | `#9aa1ad` | `#e9ecef` | `#343844` |
| `red` | `#e03131` | `#ff6b6b` | `#ffe3e3` | `#5c1f1f` |
| `orange` | `#e8590c` | `#ff922b` | `#ffe8cc` | `#5c3310` |
| `yellow` | `#e67700` | `#fcc419` | `#fff3bf` | `#5c4a00` |
| `green` | `#2f9e44` | `#51cf66` | `#d3f9d8` | `#1b4d2a` |
| `teal` | `#0c8599` | `#3bc9db` | `#c3fae8` | `#0b4a4f` |
| `blue` | `#1c7ed6` | `#4dabf7` | `#d0ebff` | `#123d66` |
| `purple` | `#7048e8` | `#9775fa` | `#e5dbff` | `#352a66` |
| `pink` | `#d6336c` | `#f06595` | `#ffdeeb` | `#5c1f3b` |

Add your own names with the `colors` / `highlights` options ([Customization](customization.md#palettes-fonts-and-sizes))
and define `--se-c-<name>` / `--se-hl-<name>` for them. In exported HTML, names resolve to the light hex
(`inline` mode) or `var(--se-c-name, hex)` (class mode).

### Spacing

Defined in `layout.css`. `compact` is the default; `comfortable` applies with `density: "comfortable"`.

**Chrome** (toolbar, menus, dialogs)

| Variable | Compact | Comfortable | Controls |
|---|---|---|---|
| `--se-btn` | `26px` | `30px` | toolbar button height and minimum width |
| `--se-icon` | `15px` | `16px` | toolbar icon size |
| `--se-gap` | `1px` | `2px` | between buttons in a group |
| `--se-toolbar-pad` | `3px 4px` | `5px 6px` | toolbar padding (also the find bar) |
| `--se-toolbar-gap` | `2px` | `4px` | between toolbar groups |
| `--se-ui-size` | `12.5px` | `13px` | text size of the chrome |
| `--se-control-h` | `30px` | `34px` | inputs and buttons in dialogs |
| `--se-control-h-sm` | `26px` | `28px` | small buttons |
| `--se-menu-pad` | `3px` | `4px` | inside menus and popovers |
| `--se-menu-item-pad` | `4px 7px` | `6px 8px` | menu rows |
| `--se-modal-pad` | `12px` | `16px` | dialog head, body and foot |
| `--se-modal-gap` | `10px` | `12px` | between fields and sections in a dialog |
| `--se-statusbar-h` | `22px` | `28px` | status bar height |
| `--se-radius` | `6px` | `8px` | outer corners, menus (dialogs add 4px) |
| `--se-radius-sm` | `4px` | `5px` | buttons, inputs, images |

**Document** (editor surface and viewer)

| Variable | Compact | Comfortable | Controls |
|---|---|---|---|
| `--se-pad-x` / `--se-pad-y` | `14px` / `10px` | `20px` / `16px` | writing-surface padding; the preview frame |
| `--se-line-height` | `1.55` | `1.65` | line height of text |
| `--se-block-gap` | `0.35em` | `0.6em` | between paragraphs and other blocks |
| `--se-heading-gap` | `0.7em` | `1.1em` | above H1/H2 (H3/H4 get 80%) |
| `--se-list-gap` | `0.05em` | `0.15em` | between list items |
| `--se-list-indent` | `1.5em` | `1.6em` | one nesting level (and marker width) |
| `--se-quote-pad` | `10px` | `14px` | quote text from its bar |
| `--se-code-pad` | `8px 10px` | `12px 14px` | code block padding |
| `--se-cell-pad` | `4px 7px` | `6px 9px` | table cell padding |
| `--se-media-gap` | `0.25em` | `0.5em` | extra room above and below images, video and rules |
| `--se-page-width` | `816px` | `816px` | page width in `variant: "document"` |
| `--se-page-pad` | `48px 56px` | `72px 80px` | page margins in `document` |
| `--se-desk-pad` | `16px 12px` | `28px 16px` | around the page in `document` |

### Type

| Variable | Default | |
|---|---|---|
| `--se-font` | Inter, system UI stack | the chrome |
| `--se-content-font` | `var(--se-font)` | documents |
| `--se-font-mono` | JetBrains Mono, system mono stack | code |
| `--se-content-size` | `15px` | paragraph text |
| `--se-transition` | `140ms ease` | hover and focus transitions |
| `--se-scrollbar-w` | `6px` | scrollbar width |
| `--se-popover-max-h` | `min(340px, 60vh)` | tallest a menu or picker gets — past it (or past the room left on screen) it scrolls |
| `--se-popover-max-w` | `min(300px, 100vw - 12px)` | widest a menu gets; long rows end in "…" |
| `--se-ctx-max-h` | `min(560px, 100vh - 8px)` | tallest the right-click menu gets |
| `--se-ctx-max-w` | `280px` | widest the right-click menu gets |

### Overflow

Every floating panel — toolbar menus, the colour picker, the right-click menu and its submenus — opens on the side
with room, never leaves the window, and scrolls inside itself when taller than the room it has (it never scrolls
the page, and scrolling it doesn't close it). On opening, the checked row (the current font, size, style…) is
scrolled into view; in the right-click menu the keyboard-highlighted row follows ↑ ↓. Dialogs are capped at the
window height and scroll in their body.

Nothing in the chrome is the browser's own widget: the colour picker, sliders, the size field, tooltips and
scrollbars are drawn by the library and follow the theme variables.

Heading sizes (30 / 24 / 19 / 16px), quote (15px) and code (13px) are fixed in `layout.css` because a size
chosen in the editor is stored in px relative to them (`BLOCK_SIZE`). To change them, override the classes
(`.se-content .se-h1 { font-size: 34px }`) — documents keep any explicit sizes their authors set.

The library loads no web fonts. Load Inter and JetBrains Mono yourself (or point `--se-font` elsewhere); without
them the system stacks are used.

## Recipes

**Match a brand colour everywhere**

```css
.se-root, .se-layer { --se-accent: #7c3aed; --se-accent-hover: #6d28d9; }
.dark .se-root:not(.se-light), .dark .se-layer:not(.se-light) { --se-accent: #a78bfa; --se-accent-hover: #c4b5fd; }
```

**A borderless editor inside your own card**

```ts
useSynTextEditor({ variant: "borderless", vars: { "pad-x": "0px", "pad-y": "6px" }, preset: "basic" });
```

**A dense, form-sized field**

```ts
useSynTextEditor({ preset: "minimal", minHeight: 64, vars: { btn: "24px", "toolbar-pad": "2px", "pad-y": "6px", "pad-x": "10px", "content-size": "14px" } });
```

**Square corners and a serif document**

```css
.se-root, .se-layer { --se-radius: 0; --se-radius-sm: 0; }
.se-content { --se-content-font: "Source Serif 4", Georgia, serif; --se-line-height: 1.7; }
```

**Brand-recolour the palette**

```css
.se-root, .se-layer, .se-content { --se-c-blue: #0057b8; --se-hl-yellow: #fff1a8; }
```

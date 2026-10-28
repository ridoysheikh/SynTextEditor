# Configuration

Everything `useSynTextEditor(config)`, `<SynEditor {...config} />` and `new SynTextEditor(config)` accept.

## Controlled options

Options are props: change one and the same editor follows — the document, the caret and undo history are kept.

| Live | How |
|---|---|
| `value` | a value different from the one the editor last reported replaces the content |
| `readOnly` | |
| `onChange` `onFocus` `onBlur` `onError` | the latest functions are always used |
| `preset` `formats` `toolbar` `statusbar` `stickyToolbar` `toolbarWrap` `placeholder` `maxLength` `minHeight` `maxHeight` `variant` `spellCheck` `ariaLabel` `theme` `density` `vars` `classNames` `styles` `colors` `highlights` `fonts` `sizes` | compared by value, so inline objects and arrays are fine |
| `storage` `upload` `contextMenu` | read when used, so functions inside them are always the latest |

Only `history`, `autoFocus` and `id` are read once. Outside React, or from anywhere with the instance:

```ts
editor.setOptions({ theme: "dark", density: "comfortable", toolbar: false });
```

Changing `preset` or `formats` changes what can be typed, pasted and inserted from then on; content already in the
document stays as it is (validate on save with [`toDoc`](document-model.md#validating-on-a-server)).

```tsx
function Note({ dark, compact, locked }: Props) {
  const editor = useSynTextEditor({
    theme: dark ? "dark" : "light",
    density: compact ? "compact" : "comfortable",
    readOnly: locked,
    preset: locked ? "minimal" : "full",
    vars: { accent: brandColor },
  });
  return editor.render();
}
```

## Content

| Option | Type | Default | |
|---|---|---|---|
| `value` | `RichDoc \| string \| null` | empty | The document, its JSON string, or plain text. Live: see [controlled](getting-started.md#controlled-or-uncontrolled). |
| `preset` | `"full" \| "standard" \| "basic" \| "minimal"` | `"full"` | What the editor allows and its toolbar. See [presets](customization.md#presets-and-formats). |
| `formats` | `Format[]` | the preset's | What the document may hold. Overrides the preset. Paste and shortcuts keep to it. |
| `placeholder` | `string` | — | Shown while the editor is empty. |
| `maxLength` | `number` | — | Characters of text. The status bar counts toward it and turns red past it. Not enforced while typing — validate on submit. |
| `history` | `number` | `300` | Undo steps kept. |

## Behaviour

| Option | Type | Default | |
|---|---|---|---|
| `readOnly` | `boolean` | `false` | No editing; the toolbar is disabled, links open on click. Live. |
| `autoFocus` | `boolean` | `false` | Focus when mounted. |
| `spellCheck` | `boolean` | `true` | The browser's spell check. |
| `id` | `string` | — | On the editable element, for `<label htmlFor>`. |
| `ariaLabel` | `string` | `"Rich text editor"` | Accessible name. |

## Toolbar and frame

| Option | Type | Default | |
|---|---|---|---|
| `toolbar` | `ToolId[][] \| false` | the preset's | Groups of tools, a divider between groups. `false` hides it. See [tool ids](customization.md#toolbar-layout). |
| `statusbar` | `boolean` | on for `full` | Word and character counts, upload progress, table position. |
| `stickyToolbar` | `boolean` | `false` | The toolbar stays at the top while the page scrolls. |
| `toolbarWrap` | `"wrap" \| "scroll"` | `"wrap"` | When narrow: wrap onto more rows, or scroll sideways. |
| `variant` | `"default" \| "borderless" \| "document"` | `"default"` | A bordered box; no border or background (sits in your own card); or a page on a desk for long-form writing. |
| `minHeight` | `number \| string` | `"8rem"` | Writing area height. Numbers are px. |
| `maxHeight` | `number \| string` | — | Past this the writing area scrolls (the toolbar stays). |

## Look

| Option | Type | Default | |
|---|---|---|---|
| `theme` | `"light" \| "dark" \| "auto" \| "inherit"` | `"inherit"` | `inherit` follows a `.dark` ancestor; `auto` follows the system. See [Theming](theming.md#theme-modes). |
| `density` | `"compact" \| "comfortable"` | `"compact"` | Spacing of the toolbar, dialogs and document. |
| `vars` | `ThemeVars` | — | Variables set inline: `{ accent: "#e11d48" }` → `--se-accent`. Keys may also be full names (`"--se-c-red"`). |
| `classNames` | `{ root?, toolbar?, surface?, content?, statusbar?, layer? }` | — | Extra classes per part — Tailwind classes work. `layer` is the wrapper of menus and dialogs (for theme classes). |
| `styles` | same keys, `CSSProperties` | — | Inline styles per part. |
| `colors` | `Swatch[]` | 9 colours | The text-colour palette. See [palettes](customization.md#palettes-fonts-and-sizes). |
| `highlights` | `Swatch[]` | 9 colours | The highlight palette. |
| `fonts` | `FontOption[]` | 7 faces | The font menu. |
| `sizes` | `number[]` | 10–64 | The size menu (any size 8–96 can still be typed). |

## Media

| Option | Type | Default | |
|---|---|---|---|
| `storage` | `StorageAdapter \| RestStorageOptions` | — | Where uploads go and the library comes from. See [Storage](storage.md). |
| `upload.accept` | `string` | images, video, PDF, Office, CSV, TXT, ZIP | Like `<input accept>`; also filters pasted and dropped files. |
| `upload.maxSize` | `number` (bytes) | 25 MB | Largest file. |
| `upload.inlineLimit` | `number` (bytes) | 1 MB | Without storage, images and video up to this size are embedded as data URLs. `0` turns it off. |

## Callbacks

| Option | Signature | |
|---|---|---|
| `onChange` | `(value: RichDoc \| null, editor) => void` | Every change. `null` when empty. |
| `onFocus` | `(editor) => void` | Focus entered the editor (cells included). |
| `onBlur` | `(editor) => void` | Focus left the editor. |
| `onError` | `(error: Error, editor) => void` | Rejected files, failed uploads, storage errors, a blocked clipboard read. |

## Right-click menu

| Option | Type | Default | |
|---|---|---|---|
| `contextMenu` | `boolean \| { items?, nativeWithShift? }` | `true` | `false` keeps the browser's menu. `items`: a list of row ids, or `(ctx, defaults) => rows`. `nativeWithShift` (default `true`): Shift + right-click opens the browser's menu. See [The right-click menu](context-menu.md). |

## Examples

```ts
// A comment box: text weight and lists, 500 characters, counter shown
useSynTextEditor({ preset: "basic", maxLength: 500, statusbar: true, minHeight: 96, placeholder: "Reply…" });

// A CMS body field
useSynTextEditor({ preset: "standard", storage, stickyToolbar: true, maxHeight: "70vh" });

// A document editor
useSynTextEditor({ preset: "full", variant: "document", density: "comfortable", storage, autoFocus: true });

// Exactly these formats, with a matching toolbar
useSynTextEditor({
  formats: ["bold", "italic", "h2", "h3", "bullet", "link", "image"],
  toolbar: [["block"], ["bold", "italic"], ["bullet"], ["link", "image"]],
});
```

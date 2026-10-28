# API reference

- [Entries](#entries)
- [The instance](#the-instance) — reading, writing, commands, dialogs, uploads, events
- [Hooks and components](#hooks-and-components)
- [EditorState](#editorstate)
- [The viewer and HTML](#the-viewer-and-html)
- [Keyboard](#keyboard)

## Entries

| Import | For | Notes |
|---|---|---|
| `@syntext/react` | the editor, hooks, tools, storage helpers — and everything in `/view` | `"use client"` |
| `@syntext/react/view` | `SynTextView`, `toHTML`, `parseHtml`, the model and validation | server-safe: no hooks, no DOM needed (except `parseHtml`) |
| `@syntext/react/layout`, `/theme`, `/tailwind` | stylesheets | see [Getting started](getting-started.md#the-stylesheets) |

## The instance

`useSynTextEditor(config)` returns a `SynTextEditor`. Outside React: `createSynTextEditor(config)`, then
`editor.attach(element)` (returns a teardown function).

### Reading

| Method | Returns |
|---|---|
| `getValue()` | `RichDoc \| null` — null when empty |
| `getDoc()` | `RichDoc` — even when empty |
| `getJSON()` | `string` |
| `getHTML(opts?)` | `string` — `{ mode: "class" \| "inline", wrap?: boolean }`, see [HTML](#the-viewer-and-html) |
| `getText()` | plain text, list markers included |
| `getLength()` / `getWords()` | characters (no line breaks) / words |
| `isEmpty()` | `boolean` |
| `getState()` | [`EditorState`](#editorstate) `\| null` (null until mounted) |
| `getSelection()` | `{ anchor, focus }` positions `{ b: blockIndex, o: offset }` |
| `isReady()` | the editor is on screen |
| `isReadOnly()` | `boolean` |

### Writing

| Method | |
|---|---|
| `setValue(value)` | replace the content (document, JSON, plain text or null). Clears undo history. |
| `clear()` | `setValue(null)` |
| `focus()` / `blur()` | |
| `setReadOnly(b)` | |

### Commands

Each acts on the selection, or — with a bare caret — on what's typed next.

| Method | |
|---|---|
| `undo()` `redo()` | |
| `toggleBold()` `toggleItalic()` `toggleUnderline()` `toggleStrike()` `toggleCode()` / `toggle(mark)` | |
| `setScript("sub" \| "sup")` | toggles |
| `setColor(c)` `setHighlight(c)` | palette name or hex; `null` clears |
| `setFont(stack)` | CSS font-family; `null` clears |
| `setSize(px)` | 8–96; `null` back to the block's size |
| `setBlock(type)` | `"p" \| "h1" \| "h2" \| "h3" \| "h4" \| "quote" \| "code"` |
| `setAlign(a)` | `"left" \| "center" \| "right" \| "justify"` (aligns a selected image too) |
| `toggleList(kind)` | `"bullet" \| "ordered" \| "check"` |
| `indent(delta = 1)` | list nesting, `-1` to step out |
| `setLink(href, text?)` | `undefined` removes; with a bare caret, inserts `text` (or the address) as a link |
| `clearFormatting()` | |
| `insertText(text)` | at the caret, replacing the selection |
| `insertHTML(html)` | read into the model and the editor's formats, like a paste |
| `insertRule()` | |
| `insertTable(rows = 3, cols = 3, header = true)` | the caret goes into the first cell |
| `insertImage(src, { alt?, caption?, width? })` | `width` in percent |
| `insertVideo(src, { caption?, width? })` | |
| `insertFile(src, { name?, bytes?, mime? })` | |
| `insertAsset(asset)` | an `Asset` from your storage |
| `selectAll()` | |

Lower-level operations live on `editor.engine` (null until mounted): `stepSize(delta)`, `copyFormat()` /
`applyFormat()` / `cancelFormat()`, `updateAtom(patch, index?)`, `removeAtom(index?)`, `moveAtom(±1, index?)`,
`selectAtom(index)`, table edits `addRow(0|1)`, `addCol(0|1)`, `deleteRow()`, `deleteCol()`, `toggleHeader()`,
`deleteTable()`, and `find(q)`, `findNext(q, caseSensitive?, back?)`, `replaceNext(q, r)`, `replaceAll(q, r)`.

### Dialogs and modes

| Method | |
|---|---|
| `openGallery(kind?, replaceIndex?)` | the media library; `kind` filters; `replaceIndex` swaps the file of that media block |
| `openLink()` | link dialog for the selection |
| `openMediaDetails(index)` | alt text, caption, width |
| `openPreview()` | rendered / HTML / JSON preview |
| `closeModal()` | |
| `toggleFind(open?)` | find & replace bar |
| `toggleFullscreen(on?)` | |
| `getUI()` | `{ modal, find, fullscreen, uploads, contextMenu, rev }` |

### Right-click menu and options

| Method | |
|---|---|
| `openContextMenu(x?, y?, target?)` | open the menu — at the caret, at a point, or as a right-click on `target` would. `false` when nothing opened |
| `closeContextMenu()` | |
| `contextMenuEnabled` | `config.contextMenu !== false` |
| `setOptions(patch, { silent? })` | change [live options](configuration.md#controlled-options) |

See [The right-click menu](context-menu.md) for rows, ids and the context object.

### Uploads

| Member | |
|---|---|
| `uploadFiles(files, near?, insert = true)` | upload through storage (or inline); inserts each as it arrives; resolves to the `Asset[]` |
| `accepts(file)` | `null` if the file may be added, else the reason |
| `storage` | the resolved `StorageAdapter`, or null |
| `uploadConfig` | `{ accept, maxSize, inlineLimit }` with defaults filled in |

### Events

```ts
const off = editor.on("change", (doc) => { … });   // returns an unsubscribe function
editor.once("ready", () => editor.focus());
```

| Event | Payload | When |
|---|---|---|
| `change` | `RichDoc \| null` | the document changed |
| `state` | — | selection, active formats, undo availability… |
| `ui` | — | a dialog, the find bar, fullscreen, uploads or read-only changed |
| `focus` / `blur` | — | focus entered / left the editor |
| `ready` | — | the editor mounted |
| `error` | `Error` | a file was refused, an upload / storage call failed, or the clipboard couldn't be read |
| `contextmenu` | `ContextMenuContext` | the right-click menu opened |

### Other members

`addFonts(...fonts)` (push onto the font menu and load them — see [custom fonts](customization.md#custom-fonts)),
`config` (the current options), `schema` (`has(format)`), `toolbar` (the resolved layout),
`palette` (`{ colors, highlights, fonts, sizes }`), `themeClass`, `varStyle`, `render({ className?, style? })`.

## Hooks and components

| | |
|---|---|
| `useSynTextEditor(config)` | create an editor for this component's lifetime; returns a stable instance |
| `useEditorValue(editor, events, select)` | re-render when `select(editor)` changes after any of `events` — e.g. `useEditorValue(editor, ["change"], (e) => e.getWords())` |
| `<SynEditor {...config} className? style? />` | the editor as a component |
| `<EditorView editor />` | what `editor.render()` returns |
| `blockFromAsset(asset)` | the block an asset would insert as |
| `createRestStorage(options)` / `createMemoryStorage(options)` | [storage](storage.md) helpers; `kindOf(mime)` |
| `PRESETS`, `TOOL_FORMAT`, `toolAllowed(editor, id)` | presets and the tool → format map |
| `LIVE_OPTIONS` | the option names `setOptions` and the hook keep live |
| `defaultContextItems(ctx)`, `resolveContextItems(ctx)`, `tidyContextItems(rows)`, `pasteFromClipboard(editor, plain?)`, `CONTEXT_ITEM_IDS` | the [right-click menu](context-menu.md)'s rows |
| `<ContextMenu editor />` | the menu itself (mounted by `render()`) |

Tools and primitives: see [Customization](customization.md#your-own-toolbar).

## EditorState

What `editor.getState()` returns, and what tools render from.

| Field | Type | |
|---|---|---|
| `active.marks` | `Marks` | formats every selected character shares (or the caret's) |
| `active.size` | `number \| null` | px, null when mixed |
| `active.block` | `TextType \| null` | null when mixed |
| `active.align` | `Align \| null` | |
| `active.list` | `ListKind \| null \| "mixed"` | |
| `canUndo` / `canRedo` | `boolean` | |
| `painting` | `boolean` | the format painter is waiting for a selection |
| `link` | `string \| null` | the link at the selection |
| `length` / `words` | `number` | |
| `atom` | `number \| null` | index of the selected image, video, file, rule or table |
| `cell` | `{ b, r, c } \| null` | the table cell holding the caret |
| `focused` / `empty` | `boolean` | |

## The viewer and HTML

From `@syntext/react/view` (and the main entry).

### `<SynTextView />`

| Prop | Type | Default | |
|---|---|---|---|
| `value` | `RichDoc \| string \| null` | — | a document, its JSON, or plain text |
| `theme` | `"light" \| "dark" \| "inherit"` | `"inherit"` | |
| `density` | `"compact" \| "comfortable"` | `"compact"` | |
| `className`, `style` | | | on the `.se-content` root |
| `fallback` | `ReactNode` | `null` | shown for an empty document |
| `linkTarget` | `"_blank" \| "_self"` | `"_blank"` | links get `rel="noopener noreferrer nofollow"` |
| `fonts` | `FontOption[] \| { add }` | — | the editor's `fonts`: faces the document uses that have a `src` are loaded |

### Functions

| Function | |
|---|---|
| `toHTML(doc, { mode?, wrap? })` | `"class"` (default): `se-*` classes, wrapped in `<div class="se-content">` unless `wrap: false` — needs the stylesheets. `"inline"`: self-contained inline styles, for email and other apps. Text and attributes are escaped. |
| `parseHtml(html, schema?)` | HTML → blocks, filtered by a schema (browser only — uses `DOMParser`) |
| `toDoc(value, schema?)` | anything stored → a clean `RichDoc` or null |
| `schemaOf(formats)` | a schema from a list of formats |
| `docToPlain(doc)` (alias `toPlainText`) · `docLength(doc)` · `docWords(doc)` · `isEmptyDoc(doc)` | |
| `safeLink(href)` · `safeSrc(src)` | the URL checks the model uses |
| `colorValue(name, "color" \| "highlight", inline?)` | a palette name → CSS value |
| `resolveFonts(fonts)` · `fontFaceCSS(fonts)` · `fontStylesheets(fonts)` · `usedFonts(fonts, blocks)` · `loadFonts(fonts)` · `fontFamily(value)` | [custom fonts](customization.md#custom-fonts) |
| `COLORS` `HIGHLIGHTS` `FONTS` `SIZES` `BLOCK_SIZE` `BLOCK_LABEL` `ALL_FORMATS` | defaults and constants |

## Keyboard

`Ctrl` is `⌘` on macOS.

| Action | Keys |
|---|---|
| Bold / italic / underline | Ctrl+B / Ctrl+I / Ctrl+U |
| Strikethrough · inline code | Ctrl+Shift+X · Ctrl+E |
| Superscript · subscript | Ctrl+. · Ctrl+, |
| Paragraph · Heading 1–4 | Ctrl+Alt+0 · Ctrl+Alt+1…4 |
| Bulleted · numbered · checklist | Ctrl+Shift+8 · Ctrl+Shift+7 · Ctrl+Shift+9 |
| Align left / centre / right / justify | Ctrl+Shift+L / E / R / J |
| Font size down / up | Ctrl+Shift+, / Ctrl+Shift+. |
| Indent / outdent a list | Tab / Shift+Tab |
| Two spaces in a code block | Tab |
| Line break (same block) | Shift+Enter |
| Leave a code block | Enter on an empty last line |
| Link · find & replace | Ctrl+K · Ctrl+F |
| Undo · redo | Ctrl+Z · Ctrl+Shift+Z or Ctrl+Y |
| Clear formatting | Ctrl+\ |
| Copy / apply formatting | Ctrl+Alt+C / Ctrl+Alt+V (Esc cancels) |
| Paste as plain text | Ctrl+Shift+V |
| Table: next / previous cell | Tab / Shift+Tab (Tab past the last cell adds a row) |
| Table: leave | arrows at the table's edges |
| Selected image / table / rule | Enter or ↓ → line after · ↑ → line before · Delete or Backspace removes |
| Open a link (editor) | Ctrl+click |
| Context menu at the caret | Menu key · Shift+F10 (Shift + right-click: the browser's menu) |
| Leave full screen | Esc |

Markdown starts, typed at the beginning of a plain line followed by a space: `#` `##` `###` `####` headings,
`-` `*` bullets, `1.` `1)` numbers, `[]` `[x]` checklist, `>` quote, ```` ``` ```` code block. Each only works if the
editor allows that format.

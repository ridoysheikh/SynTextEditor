# Changelog

All notable changes to `@syntext/react`. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and versions follow [Semantic Versioning](https://semver.org/) — before 1.0.0, a minor version may include breaking
changes, and they are always listed under **Changed** or **Removed**.

Install any version from its [GitHub release](https://github.com/ridoysheikh/SynTextEditor/releases).

## [Unreleased]

The first stable release. From here on, breaking changes come only with a new major version.

### Added

- **Code blocks are editor panes**: a header with the file name or language, line numbers, syntax colours, the
  caret's line highlighted, and long lines scroll sideways (or wrap). 26 languages with aliases, highlighted by a
  small built-in tokenizer (no dependency). The language is guessed when none is set. See `docs/code-blocks.md`.
- **The code bar** over a code block's header: language menu (type to filter), file name, line numbers, wrap and
  *Copy code*. It is the `CodeBar` slot.
- **Editing code like an IDE**: Enter keeps the indentation (one step more after `{ [ ( :`, and a closing bracket
  moves to its own line). Tab / Shift+Tab indent and outdent every selected line. Typing ```` ```ts ```` + space opens
  a code block in that language.
- Code block fields `lang`, `title`, `lineNumbers: false` and `lineWrap: true`. `editor.setCode(patch, b?)`,
  `editor.copyCode(b?)` and `EditorState.code` (the caret's code block). The `code` option
  (`{ highlight?, languages? }`).
- A Copy button on code blocks in `<SynTextView>` (`code={{ copy: false }}` drops it) and, for HTML from `toHTML`,
  `mountCode(root)`. Also `codeTextOf`, `copyText`, `CODE_LANGUAGES`, `codeLanguage`, `detectLanguage`, `tokenize`,
  `codeLines`, `blockLanguage` and `codeLabel`. `toHTML(doc, { code: { highlight: false } })`.
- **`portal` option**: where menus, pickers, tooltips and dialogs are drawn. `"auto"` (default) draws them inside
  the nearest dialog around the editor (`<dialog>`, `[role="dialog"]`, `[aria-modal="true"]`, `[data-se-portal]`).
  `"body"`, an element or a function choose for you. Exported helpers: `layerHost`, `layerFrame`, `useEscape`,
  `PORTAL_HOSTS`.
- Theme variables for code: `--se-code-head`, `--se-code-gutter`, `--se-code-line`, the `--se-tk-*` token colours
  (light and dark in `theme.css`), and the sizes `--se-code-head-h`, `--se-code-gutter-w` and `--se-code-x`.

### Changed

- **BREAKING:** class-mode HTML writes a code block as `<pre data-label …><code class="se-code-body">` with one
  `<span class="se-ln">` per line, ending in a real newline (no `<br>`), and token classes `se-tk-*`. `parseHtml`
  reads both the new and the old form, and `<pre>` from other sites (`language-*` classes, one `<div>` per line).
  Code stored before keeps its plain look until it is saved again.
- **BREAKING:** menus and dialogs are no longer always portalled to `<body>`. Inside a host's dialog they're drawn in
  that dialog (see `portal`). `.se-layer` is now out of the flow (`position: absolute`, zero size) wherever it sits.
- Escape is handled in the capture phase on `window`. The newest open menu or dialog of the editor closes first, then
  the find bar, then full screen, and the key goes no further. The right-click menu takes its keys the same way.
- Enter on an empty last line of a code block leaves it, even when the line holds only indentation.

### Fixed

- **The editor inside a modal** (Radix/shadcn `Dialog` or `Sheet`, Headless UI, MUI, a native `<dialog>`):
  - the colour picker, menus, the right-click menu and dialogs showed but ignored clicks (the pointer fell through
    to the text behind them)
  - their fields lost focus as soon as they got it
  - Escape closed the whole host dialog
- Menus, tooltips and the right-click menu are placed correctly in a dialog that is transformed (centred with
  `translate`) or clips its content, and stay inside its box. A dialog's backdrop covers the screen there too.
- A caret just after a line break is drawn at the start of the next line, not the end of the line before.

## [0.8.0] - 2026-10-29

### Added

- **Free media sizing** — images and videos take a width in px (`w`, 20–10000, no longer bounded by the content
  width) and a height (`h`), independent of the aspect ratio. A percent width (`width`) now runs 5–100; 100 means the
  full width. Eight resize handles on a selected image or video: corners keep the proportions (Shift frees them), sides
  stretch one dimension, with a live size readout. *Exact size…* and the details dialog take typed values, in px or %.
- **Fit** — with a fixed height, `fit: "contain" | "cover"` chooses how the picture fills its box (default: stretch).
- **Text wrapping** — `wrap: true` with `align` left or right makes text flow around an image or video. The floating
  bar has a Text wrap menu; email export writes it as a float.
- **Linked images** — an image can be a link (`link`): the floating bar's link button, Ctrl+K / `setLink` with the image
  selected, or the details dialog. Exported and read back as `<a><img></a>`.
- **`embedUrls`** — a pasted image or video address alone on an empty line becomes the media (off by default).
- `normaliseMedia()`, `MEDIA_MIN`, `MEDIA_MAX`, `--se-wrap-gap`; `insertImage` / `insertVideo` accept the new fields.

### Changed

- The details dialog has Size (px or %, width × height), Position, text wrap, fit and link instead of a width slider.
- Image and video HTML carries `data-w`, `data-h`, `data-fit`, `data-pct` and `data-wrap`, and reads back losslessly.
- A percent width can now be 100 (it was dropped as "no width", which meant the natural size, not the full width).

## [0.7.1] - 2026-10-29

### Fixed

- Icons inside a replacement `Button` (`components.Button`) were drawn at the icon library's default 24px — the
  gallery's refresh and delete icons looked huge. Icons in any button, in dialogs and the toolbar, now take `--se-icon`
  unless you size them yourself.

## [0.7.0] - 2026-10-29

### Added

- **Icon scale** — icon sizes are `em` variables (`--se-icon`, `-sm`, `-xs`, `-caret`, `-lg`) so they follow the text
  they sit beside, plus `--se-icon-stroke` for the line weight. Every icon is centred on its line, and the search
  field's icon is centred in the field. See `docs/theming.md`.

### Changed

- Icons were fixed pixel sizes (11–28px); they are now em-based and land within a pixel of the old sizes at the
  default text size. `--se-icon` defaults to `1.2em` (it was `15px` / `16px` when comfortable).

## [0.6.1] - 2026-10-29

### Fixed

- The size box, steppers and "Default" menu item use the sizes the stylesheet draws (`--se-content-size`,
  `--se-h1-size`…) instead of the built-in ones, so changing those variables no longer leaves the toolbar showing
  stale numbers (and stepping from a heading no longer jumps).

## [0.6.0] - 2026-10-29

### Added

- **Type scale variables** — the chrome's font sizes (`--se-fs-2xs` … `--se-fs-lg`) and weights (`--se-fw-medium`,
  `-semibold`, `-bold`), and the document's heading sizes and weights (`--se-h1-size` … `--se-h4-weight`),
  `--se-code-size`, `--se-table-size` and `--se-file-size`. All fall back to the previous values. See
  `docs/theming.md`.

## [0.5.0] - 2026-10-29

### Added

- Dialog title tracking and line height, blur behind the header and footer, and the footer button gap are variables
  (`--se-modal-title-tracking`, `--se-modal-title-leading`, `--se-modal-bar-blur`, `--se-modal-foot-gap`).

### Fixed

- A dialog shown as a sheet ignored `--se-sheet-width` (the dialog's own max width was applied inline).

## [0.4.1] - 2026-10-29

### Fixed

- The groups after a `spacer` tool stay pinned to the right edge when the toolbar wraps onto a second row (they used to drop to the left).

## [0.4.0] - 2026-10-29

### Added

- **Sheets** — `dialogs: "sheet"` (or per dialog: `{ gallery: "sheet" }`) opens the dialogs as a panel from the right
  edge instead of centred. `--se-sheet-top` / `--se-sheet-width` place it. `Modal` gets `variant` and `kind` props.
  `editor.dialogVariant(kind)` reports the choice.
- **Shape and dialog chrome variables** — a variable per corner (`--se-radius-box`, `-menu`, `-dialog`, `-sheet`,
  `-btn`, `-tool`, `-field`, `-tip`) and for the dialog's border, shadow, backdrop blur, header / body / footer
  background, padding and title, plus `--se-popover-border` / `--se-popover-shadow`. All fall back to the old values,
  so nothing changes until you set one. See `docs/theming.md`.
- **Compact toolbar** — a `spacer` tool pushes the groups after it to the right edge, and a `status` tool puts the
  word count and upload progress in the toolbar (`StatusTool`), so an editor can drop its status bar.

## [0.3.1] - 2026-10-29

### Fixed

- **HTML round trip** — what `toHTML` writes now reads back to the same document through `parseHtml`, `insertHTML`
  and paste, so a body can be stored as HTML and opened again. Class-mode HTML used to lose bold, italic,
  underline, strikethrough, inline code, palette colours and highlights, list nesting, image / video alignment,
  table cell alignment and file blocks. Inline-mode HTML used to gain a grey colour on quotes, a highlight on code
  blocks, a literal `☐` / `☑` in checklist items, strikethrough on ticked items, an underline on links, a size on
  inline code, a `📎` in file names, and lost video widths. The one remaining difference is by design: inline mode
  has no CSS variables, so a palette colour comes back as its hex value.
- An image, video, table or rule inside a pasted `<p>` or `<figure>` no longer leaves an empty paragraph before it.

## [0.3.0] - 2026-10-29

### Added

- **Caret context** — `editor.getCaretContext()` returns the text of the caret's block, the caret's offset into it
  and its box relative to the editor's scroll box (`CaretContext`), and `editor.replaceRange(from, to, text, block?)`
  swaps characters in that block, keeping their formatting. Together with the `state` event they are enough to
  build `@mention` / `[%{token}` / slash-command completion outside the library.
- **Phrase marks** — `editor.markPhrases(phrases)` underlines every occurrence of the phrases and returns the
  count; `clearMarks()` removes them. Drawn with CSS Custom Highlights, so they are never part of the document, the
  HTML or undo. Style with `--se-mark`.

## [0.2.0] - 2026-10-29

### Added

- **Video thumbnails** — a video block has an optional `poster` (an image address). Choose it from the video's
  current frame, an upload, your media library or a link: in the video's details, the bar over a selected video,
  or right-click ▸ Thumbnail. `insertVideo(src, { poster })`, `setVideoThumbnail`, `captureThumbnail`,
  `uploadThumbnail` and `openThumbnailLibrary` on the instance. Exported to HTML as `<video poster>` and read back.
- **Video player** — a slim player drawn by the library replaces the browser's controls in the writing area, the
  viewer and the details dialog: play button over the thumbnail, seek with buffered range and hover time, volume,
  speed, full screen, keyboard control, compact on narrow players. Styled by `--se-player-*` variables;
  `components.VideoPlayer` replaces it in the viewer (`<SynTextView components>`) and the dialog.
  `mountPlayers()` draws it into HTML from `toHTML`. See `docs/video.md`.

### Changed

- Videos from `toHTML` (class mode) are wrapped in `<div class="se-player">`; call `mountPlayers()` to draw the
  library's player into them. Inline-mode HTML is unchanged apart from `poster`.
- The viewer's video is a client component in its own `"use client"` chunk; `@syntext/react/view` is still safe to
  import from a Server Component.

### Fixed

- `toDoc` and `safeLink` no longer throw on a non-string `src`, `poster` or link in untrusted JSON — the value is
  dropped instead.

## [0.1.0] - 2026-10-29

The first release.

### Added

- **Editor** — `useSynTextEditor(config)` returns a stable instance that is the whole API; `editor.render()`
  mounts it. `<SynEditor />` for when you don't need the instance; `createSynTextEditor()` outside React.
- **Document model** — documents are JSON (blocks of spans), never HTML. Undo and redo, paste from Word and web
  pages, markdown shortcuts, find and replace, format painter.
- **Formats** — bold, italic, underline, strikethrough, inline code, sub/superscript, colours, highlights, fonts,
  sizes, headings 1–4, quotes, code blocks, bulleted / numbered / checklists with nesting, alignment, links,
  images, video, files, tables, rules.
- **Presets** — `full`, `standard`, `basic` (text weight and lists) and `minimal`, or an exact `formats` list.
  The schema also filters paste and shortcuts.
- **Media over your storage** — give it four operations (upload, list, get, delete) as functions or REST
  endpoints. Gallery, uploads with progress, paste and drop. Without storage, small media is embedded inline.
- **Viewer** — `SynTextView` and `toHTML` (class or inline-style HTML) from the server-safe
  `@syntext/react/view` entry; `toDoc` to validate on a server.
- **Theming** — every colour and size is a `--se-*` CSS variable under prefixed `se-*` classes; light, dark,
  `auto` and inherited dark mode; compact and comfortable density; `vars`, `classNames` and `styles` per part;
  Tailwind support.
- **Controlled options** — options are live props: change `theme`, `preset`, `toolbar`, `vars`, `readOnly`… and
  the same editor follows, content and undo kept. `editor.setOptions()` outside React.
- **Right-click menu** — context-aware rows for text, links, images, files and table cells; choose rows by id,
  add your own with submenus, or turn it off. Menu key and Shift+F10 open it at the caret.
- **Custom fonts** — `fonts: { add: [...] }` pushes fonts onto the menu; a stylesheet or font-file `src` is
  loaded for you, and the viewer loads the ones a document uses. `editor.addFonts()` at runtime.
- **Your own components** — every part of the UI is a replaceable slot (`components`): wrap the library's
  default or draw your own — buttons, tooltips, menus, dialogs, sliders, the colour picker, the toolbar, single
  tools — and add new toolbar tools. Live.
- **Library-drawn UI** — no browser widgets: a custom colour picker, sliders, size field and tooltips; menus and
  pickers fit the window and scroll when they're taller than the room they have.
- **Docs** — getting started, configuration, theming, customization, components, right-click menu, storage, API
  reference and the document model, in `docs/`.

[Unreleased]: https://github.com/ridoysheikh/SynTextEditor/compare/v0.8.0...HEAD
[0.8.0]: https://github.com/ridoysheikh/SynTextEditor/compare/v0.7.1...v0.8.0
[0.7.1]: https://github.com/ridoysheikh/SynTextEditor/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/ridoysheikh/SynTextEditor/compare/v0.6.1...v0.7.0
[0.6.1]: https://github.com/ridoysheikh/SynTextEditor/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/ridoysheikh/SynTextEditor/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/ridoysheikh/SynTextEditor/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/ridoysheikh/SynTextEditor/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/ridoysheikh/SynTextEditor/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/ridoysheikh/SynTextEditor/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/ridoysheikh/SynTextEditor/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/ridoysheikh/SynTextEditor/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ridoysheikh/SynTextEditor/releases/tag/v0.1.0

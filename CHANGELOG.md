# Changelog

All notable changes to `@syntext/react`. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and versions follow [Semantic Versioning](https://semver.org/) — before 1.0.0, a minor version may include breaking
changes, and they are always listed under **Changed** or **Removed**.

Install any version from its [GitHub release](https://github.com/ridoysheikh/SynTextEditor/releases).

## [Unreleased]

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

[Unreleased]: https://github.com/ridoysheikh/SynTextEditor/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/ridoysheikh/SynTextEditor/releases/tag/v0.1.0

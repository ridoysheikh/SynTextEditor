# SynTextEditor — `@syntext/react`

📖 **Full documentation: [docs/](docs/INDEX.md)** — [configuration](docs/configuration.md), [right-click menu](docs/context-menu.md), [theming](docs/theming.md) (every variable), [customization](docs/customization.md), [storage](docs/storage.md), [API](docs/api.md), [document model](docs/document-model.md).

A rich text editor for React and Next.js. The document is **data, not HTML**: the editor edits a small JSON model,
the viewer draws it as React elements, and `toHTML` writes it out when you need HTML.

- **Word-processor richness or a plain comment box** from one component: presets go from `full` (fonts, sizes,
  colours, tables, media, checklists, find & replace) to `basic` (text weight and lists). The preset's *schema*
  also filters paste and shortcuts, so a `basic` editor stays basic even when someone pastes from Word.
- **Direct React binding** — `const editor = useSynTextEditor(config)` returns a stable instance that *is* the API.
  No provider, no context.
- **Media over your own storage** — give it four operations (upload, list, get, delete) as functions or REST
  endpoints. It handles the gallery, uploads with progress, paste and drop. It stores nothing itself.
- **Themeable** — every colour and size is a `--se-*` CSS variable under prefixed `se-*` classes, so it never
  collides with your styles. Override variables in CSS, pass `vars` inline, or add Tailwind classes per part.
- **Controlled** — options are props: change `theme`, `preset`, `toolbar`, `vars`, `readOnly`… and the same editor
  follows, content and undo kept.
- **A right-click menu you control** — context-aware rows for text, links, images, files and table cells; pick
  rows by id, add your own with submenus, or turn it off.
- **Video with custom thumbnails** — pick a thumbnail from the current frame, an upload, your library or a link;
  a slim player drawn by the library (seek, volume, speed, full screen, keyboard) in the editor and the viewer.
- **Your own components, anywhere** — the UI is drawn by the library (no browser widgets), and every part is a
  slot: pass `components` to wrap the default or swap in your own — buttons, tooltips, menus, dialogs, sliders, the
  colour picker, the toolbar, single tools — or add new tools. Live.
- **Custom fonts** — push web fonts onto the font menu (`fonts: { add: [...] }`) with a stylesheet or font-file
  `src`; the editor loads them, and the viewer loads the ones a document uses.
- **Lightweight** — ~40 KB gzipped for the full editor UI, ~9 KB for the viewer, ~6 KB CSS. Peer deps: React 18+.
  One dependency: `lucide-react` (icons, tree-shaken).

## Install

Releases are published on GitHub ([all releases](https://github.com/ridoysheikh/SynTextEditor/releases)), each
with a ready-built package. Install one by its URL:

```bash
npm install https://github.com/ridoysheikh/SynTextEditor/releases/download/v0.4.1/syntext-react-0.4.1.tgz
# pnpm add …   ·   yarn add …   ·   bun add …   (same URL)
```

Your `package.json` then has `"@syntext/react": "https://github.com/…/syntext-react-0.1.0.tgz"`, and you import
`@syntext/react` as usual. Peer dependencies: `react` and `react-dom` 18 or newer.

- **Upgrading:** install the URL of a newer release (the version is in both the tag and the file name).
- **Always the newest:** `https://github.com/ridoysheikh/SynTextEditor/releases/latest/download/syntext-react.tgz`
  — handy for trying it out, but pin a version in real projects: lockfiles record the file's checksum, and "latest"
  changes underneath it.
- **Checking the download:** each release carries `SHA256SUMS`.
- **What changed:** see [CHANGELOG.md](CHANGELOG.md) — every release lists what was added, changed, fixed or
  removed, and the release notes on GitHub say the same.
- **Private CI or offline:** download the `.tgz` into your repo (e.g. `vendor/`) and install it by path:
  `npm install ./vendor/syntext-react-0.1.0.tgz`.

## Set up (Next.js App Router)

```tsx
// app/layout.tsx — once
import "@syntext/react/layout";   // structure (always)
import "@syntext/react/theme";    // default light/dark colours (skip to theme entirely yourself)
```

```tsx
// app/notes/editor.tsx
"use client";
import { useSynTextEditor, type RichDoc } from "@syntext/react";

export function NoteEditor({ initial }: { initial: RichDoc | null }) {
  const editor = useSynTextEditor({
    value: initial,                       // a document, its JSON string, or plain text
    placeholder: "Start writing…",
    onChange: (doc) => save(doc),         // RichDoc | null
  });
  return editor.render();
}
```

```tsx
// app/notes/[id]/page.tsx — a Server Component
import { SynTextView } from "@syntext/react/view";

export default async function Page({ params }) {
  const note = await db.note.find(params.id);
  return <SynTextView value={note.body} />;
}
```

`@syntext/react/view` has no hooks and no `"use client"` — render or convert documents on the server with it.

## Presets and formats

| preset | for | allows |
|---|---|---|
| `full` (default) | long-form documents | everything: fonts, sizes, colours, highlights, sub/sup, H1–H4, quote, code block, lists, checklists, alignment, links, images, video, files, tables, rules |
| `standard` | articles, descriptions | marks, colour, size, H1–H3, quote, lists, alignment, links, images, rules |
| `basic` | comments, short fields | bold, italic, underline, strike, bulleted and numbered lists, links |
| `minimal` | one-liners | bold, italic, links |

Mix your own with `formats` (what the document may hold) and `toolbar` (groups of tool ids):

```ts
useSynTextEditor({
  formats: ["bold", "italic", "bullet", "ordered", "check", "link", "image"],
  toolbar: [["bold", "italic"], ["bullet", "ordered", "check"], ["link", "image"]],
});
```

A tool whose format isn't allowed is left off the toolbar automatically. Tool ids: `undo redo block font size bold
italic underline strike code sub sup color highlight align bullet ordered check outdent indent quote codeblock link
image video file media table hr painter clear find preview fullscreen`.

## Storage: four operations

```ts
// As REST endpoints
useSynTextEditor({
  storage: {
    upload: "/api/media",                 // POST multipart, field "file" (or { url, method: "PUT", field })
    list:   "/api/media",                 // GET ?cursor=&limit=&search=&kind=image|video|file
    get:    "/api/media/:id",             // GET
    remove: "/api/media/:id",             // DELETE
    headers: () => ({ Authorization: `Bearer ${token()}` }),
  },
});

// Or as functions — anything: S3 presigned URLs, Supabase, Firebase, your server actions
useSynTextEditor({
  storage: {
    upload: async (file, { onProgress, signal }) => Asset,
    list:   async ({ cursor, limit, search, kind }) => ({ items: Asset[], next?: string | null }),
    get:    async (id) => Asset,           // optional — refreshes details in the gallery
    remove: async (id) => void,            // optional — enables Delete in the gallery
  },
});
```

An `Asset` is `{ id, url, name, type /* MIME */, size?, width?, height?, thumbnail?, createdAt? }`. REST responses
may be the asset itself or `{ data: asset }`; lists may be an array, `{ items, next }` or `{ data, next_cursor }` —
or pass `mapAsset` / `mapList`. Without storage, the gallery offers links, and images under `upload.inlineLimit`
(1 MB) are embedded as data URLs. `createMemoryStorage()` is a working in-page store for prototypes.

## Theming

Every value is a variable on `.se-root` (the editor), `.se-layer` (its menus and dialogs) and `.se-content` (a
document). Dark mode follows a `.dark` ancestor (Tailwind's class strategy), or force it with `theme`.

```css
/* Your CSS — or a wrapper class for a second look */
.se-root, .se-layer { --se-accent: #e11d48; --se-radius: 12px; }
.brand-forest .se-root { --se-content-font: Georgia, serif; --se-bg: #fbfdf9; }
```

```tsx
useSynTextEditor({
  theme: "dark",                                  // "light" | "dark" | "auto" | "inherit" (default)
  vars: { accent: "#e11d48", radius: "12px" },    // → --se-accent, --se-radius, inline
  classNames: { root: "shadow-xl", toolbar: "px-3", surface: "min-h-64" },  // Tailwind works here
  styles: { root: { maxWidth: 800 } },
  variant: "document",                            // "default" | "borderless" | "document" (a page on a desk)
  density: "comfortable",                         // "compact" (default) | "comfortable"
});
```

Palette colours are stored by name (`"red"` → `var(--se-c-red)`), so a theme recolours old documents too; custom
colours are stored as hex. With Tailwind v4, `@import "@syntext/react/tailwind"` adds `bg-se-surface`,
`text-se-accent`… as utilities for your own UI.

## The instance

```ts
editor.getValue()        // RichDoc | null      editor.setValue(docOrJsonOrText)
editor.getHTML()         // class-based HTML    editor.getHTML({ mode: "inline" })  // self-contained, for email
editor.getText()         editor.getWords()      editor.getLength()    editor.isEmpty()
editor.focus()           editor.setReadOnly(true)
editor.toggleBold()      editor.setColor("red") editor.setSize(18)    editor.setBlock("h2")   editor.toggleList("check")
editor.insertImage(url)  editor.insertTable(3, 4)  editor.insertHTML(html)  editor.insertText("…")
editor.openGallery()     editor.openLink()      editor.toggleFind()   editor.toggleFullscreen()
editor.uploadFiles(files)
editor.on("change", (doc) => …)   // also "state", "focus", "blur", "error", "ready", "ui"
```

`useEditorValue(editor, ["change"], (e) => e.getWords())` subscribes a component to just what it reads.
`<SynEditor {...config} />` is the one-line component form. Every toolbar tool is exported
(`<MarkTool editor={editor} mark="bold" />`, `<ColorTool …/>`, `<MediaTool …/>`) for building your own bar — wrap
it in `className="se-scope"` to give it the editor's variables.

## Keyboard

| | |
|---|---|
| Bold / italic / underline / strike | Ctrl+B / I / U / Shift+X |
| Inline code · super · subscript | Ctrl+E · Ctrl+. · Ctrl+, |
| Paragraph · H1–H4 | Ctrl+Alt+0 · Ctrl+Alt+1…4 |
| Bulleted · numbered · checklist | Ctrl+Shift+8 · 7 · 9 |
| Align left / centre / right / justify | Ctrl+Shift+L / E / R / J |
| Size down / up | Ctrl+Shift+, / . |
| Indent list · out | Tab · Shift+Tab |
| Link · find | Ctrl+K · Ctrl+F |
| Copy / apply formatting | Ctrl+Alt+C / V |
| Paste as plain text | Ctrl+Shift+V |
| In a table | Tab / Shift+Tab between cells (Tab past the last adds a row) |
| Selected image | arrows step off, Delete removes, drag the corner to resize |

Typing `# `, `## `, `- `, `1. `, `[] `, `> ` or ```` ``` ```` + space at the start of a line formats it.

## The document

```ts
{ version: 1, blocks: [
  { type: "h2", spans: [{ text: "Care" }] },
  { type: "p", list: "bullet", spans: [{ text: "Cotton ", bold: true }, { text: "100%", size: 18, color: "green" }] },
  { type: "image", src: "https://…/a.jpg", width: 60, caption: "…", spans: [] },
  { type: "table", head: true, rows: [[{ spans: [{ text: "Size" }] }]], spans: [] },
] }
```

Validate on your server with the same rules: `toDoc(value, schemaOf(formats))` drops anything outside the model
and the schema (unsafe links and sources included) — it runs in Node.

## Develop

```bash
pnpm install
pnpm dev          # the demo app (test-preview/) at localhost:5173
pnpm test         # unit tests (core model, ops, tables, HTML, storage)
pnpm build:lib    # the package, into dist-lib/
npm pack          # dist-lib/ as an installable .tgz — test it in another app with `npm install ../path/to.tgz`
```

`syn-text-editor/` is the library: `core/` (model, ops, tables, HTML, storage — no DOM, no React), `editor/` (the
contentEditable engine), `UI/` (toolbar, dialogs, gallery), `view/` (the viewer), `styles/`.

## License

[MIT](LICENSE)

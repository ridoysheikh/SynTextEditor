# The document model

A document is JSON. Store it as-is (a JSON column, a document database) or as a string — `toDoc` reads both.

```ts
interface RichDoc { version: 1; blocks: Block[] }
```

## Blocks

Every block has a `type` and `spans` (empty for blocks that aren't text).

| `type` | Is | Fields |
|---|---|---|
| `p` | paragraph — and every list item | `align?`, `list?`, `indent?`, `checked?` |
| `h1` `h2` `h3` `h4` | headings | `align?` |
| `quote` | quotation | `align?` |
| `code` | code block (line breaks are `\n` in the text) | |
| `hr` | horizontal rule | |
| `image` | image | `src`, `alt?`, `caption?`, `width?` (10–99, % of the content width; absent = 100), `align?` (`"left"`, `"right"`; absent = centred), `asset?` |
| `video` | video | `src`, `poster?` (thumbnail, an image address), `caption?`, `width?`, `align?`, `asset?` |
| `file` | attachment | `src`, `name?`, `mime?`, `bytes?`, `asset?` |
| `table` | table | `rows: Cell[][]`, `head?: true` (first row is a header) |

| Field | |
|---|---|
| `align` | `"center" \| "right" \| "justify"` on text (left is the default and isn't stored) |
| `list` | `"bullet" \| "ordered" \| "check"` — a list item is a `p` with `list` |
| `indent` | list nesting, 1–6 (absent = 0) |
| `checked` | `true` on a ticked checklist item |
| `asset` | the storage id the file came from |

A table cell is `{ spans: Span[]; align?: "center" | "right" | "justify" }`. Cells hold one paragraph each; line
breaks inside a cell are `\n`.

## Spans and marks

```ts
interface Span {
  text: string;
  bold?: true; italic?: true; underline?: true; strike?: true; code?: true;
  script?: "sub" | "sup";
  size?: number;        // px, 8–96 — absent = the block's own size
  font?: string;        // a CSS font-family stack
  color?: string;       // a palette name ("red") or hex ("#e03131")
  highlight?: string;   // a palette name ("yellow") or hex
  link?: string;        // http(s), mailto:, tel:, a path or #anchor
}
```

Neighbouring spans with the same marks are always merged; empty spans are dropped.

Default sizes per block (`BLOCK_SIZE`): paragraph 15, H1 30, H2 24, H3 19, H4 16, quote 15, code 13, table 14 px.

## Example

```json
{
  "version": 1,
  "blocks": [
    { "type": "h2", "spans": [{ "text": "Care" }] },
    { "type": "p", "list": "bullet", "spans": [{ "text": "Cotton ", "bold": true }, { "text": "100%", "color": "green" }] },
    { "type": "p", "list": "check", "checked": true, "spans": [{ "text": "Machine washable" }] },
    { "type": "image", "src": "https://cdn.example.com/a.jpg", "alt": "Folded shirt", "width": 60, "spans": [] },
    { "type": "table", "head": true, "spans": [], "rows": [
      [{ "spans": [{ "text": "Size" }] }, { "spans": [{ "text": "Chest" }], "align": "right" }],
      [{ "spans": [{ "text": "M" }] }, { "spans": [{ "text": "102 cm" }], "align": "right" }]
    ] }
  ]
}
```

## Validating on a server

Never trust a document from a client. `toDoc` rebuilds it from scratch, keeping only what the model allows — and,
given a schema, only what your editor allows:

```ts
import { toDoc, schemaOf, docLength, isEmptyDoc } from "@syntext/react/view";

const schema = schemaOf(["bold", "italic", "underline", "strike", "bullet", "ordered", "indent", "link"]);
const doc = toDoc(body.comment, schema);          // RichDoc | null
if (!doc || isEmptyDoc(doc)) throw new Error("Write something");
if (docLength(doc) > 500) throw new Error("Too long");
await db.comment.create({ body: doc });
```

`toDoc` drops unknown block types and fields, links and sources that aren't safe (`javascript:`, `data:` other than
images and video), colours that aren't a palette name or hex, fonts with odd characters, and control characters;
it clamps sizes, widths and indents. Use the same formats as the editor — `schemaOf(PRESETS.basic.formats)` (`PRESETS` is exported from `/view`), or your own list.

## Plain text, counts and HTML

```ts
docToPlain(doc)   // "Care\n• Cotton 100%\n[x] Machine washable\n…" — search indexes, previews, notifications
docLength(doc)    // characters of text
docWords(doc)     // words
toHTML(doc)                       // class-based HTML (needs the stylesheets)
toHTML(doc, { mode: "inline" })   // self-contained HTML for email
```

## HTML in

Pasted HTML (Word, Google Docs, web pages) is read into the model: bold, italic, underline, strike, sizes (px, pt,
em, %), exact colours (pure black and white are dropped so text follows the theme), fonts, alignment, headings, lists
(nesting included), checklists, links, tables, images and video. Everything else is dropped, then the editor's
formats apply. Copying from one SynTextEditor to another keeps the exact blocks.

`editor.insertHTML(html)` and `parseHtml(html, schema)` (browser only) use the same reader — handy for importing
existing HTML content into documents.

The reader also understands what `toHTML` writes, in both modes — `se-*` classes, palette variables, `data-indent` /
`data-align`, inline-mode checklists — so a body can be **stored as HTML** and loaded again:

```ts
const html = editor.getHTML();                                   // save this
const blocks = parseHtml(html, editor.schema);                   // later: open it again
editor.setValue(toDoc({ version: 1, blocks }, editor.schema));
```

It is lossless for class mode. Inline mode (email) has no CSS variables, so a palette colour comes back as its hex
value; everything else is kept. Empty paragraphs at the very start or end, and runs of more than one, are dropped.

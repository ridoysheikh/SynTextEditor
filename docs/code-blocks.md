# Code blocks

A code block is drawn like a pane of a code editor: a header with the file name or the language, numbered lines,
syntax colours, and Copy. The editor adds a bar for the language, file name, line numbers and wrapping, plus the
editing keys you'd expect. The editor, the viewer and `toHTML` draw it the same way.

## In the document

A code block is a text block (`type: "code"`) whose lines are separated by `\n`. It may carry:

| Field | |
|---|---|
| `lang` | the language, a `CODE_LANGUAGES` id (`"typescript"`, `"python"`…). Absent: guessed from the text each time it's drawn |
| `title` | a file name or title (≤ 80 characters) shown in the header instead of the language |
| `lineNumbers` | `false` hides the line numbers (shown by default) |
| `lineWrap` | `true` wraps long lines instead of scrolling sideways |

```ts
{ type: "code", lang: "typescript", title: "src/app.ts", spans: [{ text: "export const a = 1;\nexport const b = 2;" }] }
```

`cleanBlock` / `toDoc` keep these fields on code blocks only, and an unknown language is dropped. When a block stops
being code (another block type, or Enter on an empty last line), they go.

## Languages

Plain text, Shell, C, C++, C#, CSS, Diff, Dockerfile, Go, GraphQL, HTML/XML, Java, JavaScript, JSON, Kotlin,
Markdown, PHP, Python, Ruby, Rust, SCSS, SQL, Swift, TOML, TypeScript and YAML. Each has aliases
(`ts`, `js`, `py`, `sh`, `yml`, `c++`…), which a fence, a pasted `class="language-…"` and `codeLanguage()` all read.

The highlighter is built in and small (no dependency). It colours comments, strings, numbers, keywords, types,
literals, functions, properties, tags, decorators and directives, variables, operators, and added/removed lines in
diffs. It never fails: anything it doesn't recognise stays plain text.

## In the editor

- **Code bar.** Over the header of the block the caret is in, or the one under the pointer: the language menu (type to
  filter, Enter picks the first; *Auto* guesses), *File name*, *Line numbers*, *Wrap long lines* and *Copy code*.
  In read-only mode only Copy is shown.
- **Enter** keeps the line's indentation, adding a step after `{`, `[`, `(` or `:`. Between a pair of brackets the
  closing one moves to its own line. **Enter on an empty last line** (indentation counts as empty) leaves the block.
- **Tab** inserts two spaces. With several lines selected, Tab indents every line and **Shift+Tab** outdents them.
  Shift+Tab with a caret outdents the line.
- The caret's line is highlighted.
- Typing ```` ``` ```` + space at the start of a line makes a code block. ```` ```ts ```` + space (any language or
  alias) makes one in that language.

```ts
editor.setCode({ lang: "python", title: "main.py" });     // the caret's code block (or pass a block index)
editor.setCode({ lineNumbers: false, lineWrap: true }, 3);
await editor.copyCode();                                   // its text to the clipboard → true / false
editor.getState()?.code;                                   // the caret's code block index, or null
```

Options:

| Option | |
|---|---|
| `code.highlight` | `false` draws code blocks without colours (also in `getHTML()`). Default `true`. |
| `code.languages` | the ids the language menu offers, in that order (default: all) |

The bar is the `CodeBar` [slot](components.md), if you want to draw your own.

## In the viewer

`<SynTextView>` draws code blocks with their header, numbers and colours, and a Copy button (a small client
component, so the viewer still renders in a Server Component). `code={{ highlight: false }}` leaves them
uncoloured, `code={{ copy: false }}` drops the button.

## In HTML

Class-mode `toHTML` writes a code block as:

```html
<pre class="se-blk se-code" data-lang="typescript" data-title="src/app.ts" data-label="src/app.ts"><code class="se-code-body"><span class="se-ln"><span class="se-tk-k">export</span> …
</span><span class="se-ln">…</span></code></pre>
```

- Every line is a `.se-ln` and ends with a real newline, so any reader (search, a plain-text strip, another
  site's code highlighter) still gets the code's text.
- The header (`data-label`) and the line numbers are drawn by the stylesheet. They aren't text, so they're never
  copied or indexed.
- `parseHtml` reads all of it back, including the language, title and line options, and also reads `<pre>` from
  other editors and sites (`language-*` classes, one `<div>` per line).

The Copy button needs script. Add it once the HTML is on the page:

```ts
import { mountCode } from "@syntext/react/view";
useEffect(() => mountCode(container), [html]);   // returns a function that removes the buttons
```

`codeTextOf(pre)` gives a drawn block's text. `copyText(text)` copies with a fallback for pages without the
Clipboard API. Inline-mode HTML (email) keeps a plain `<pre>`.

## Colours

The token colours are `--se-tk-*` variables (set by `theme.css` for light and dark; without them code is one
colour): `c` comment · `s` string · `n` number · `k` keyword · `t` type · `l` literal · `f` function ·
`p` property · `g` tag · `m` meta · `v` variable · `o` operator · `r` regex/escape · `h` heading · `a`/`a-bg`
added line · `d`/`d-bg` removed line. The pane uses `--se-pre-bg`, `--se-code-head` (header), `--se-code-gutter`
(line numbers), `--se-code-line` (the caret's line), and the sizes `--se-code-head-h`, `--se-code-gutter-w` and
`--se-code-x`. See [theming](theming.md#code-blocks).

## Functions

| Function | |
|---|---|
| `CODE_LANGUAGES` · `codeLanguage(nameOrAlias)` | the languages · one by id, alias or name |
| `detectLanguage(text)` | a best guess (`"plain"` when nothing fits) |
| `tokenize(text, lang)` | `{ start, end, kind }[]` |
| `codeLines(spans, lang, { highlight? })` | a block as lines of runs (`{ text, marks, tk? }`) — what every renderer draws |
| `blockLanguage(block)` · `codeLabel(block)` | the language a block is drawn in · what its header says |
| `mountCode(root)` · `codeTextOf(pre)` · `copyText(text)` | Copy for HTML |

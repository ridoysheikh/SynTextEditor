# Getting started

## Install

From a [GitHub release](https://github.com/ridoysheikh/SynTextEditor/releases) — pick a version, install its
package by URL:

```bash
npm install https://github.com/ridoysheikh/SynTextEditor/releases/download/v0.2.0/syntext-react-0.2.0.tgz
# pnpm add / yarn add / bun add take the same URL. Peer dependencies: react >= 18, react-dom >= 18
```

It installs as `@syntext/react`; every import below uses that name. See the
[README](../README.md#install) for upgrading, the always-newest link and offline installs.

## The stylesheets

Import them once, at the root of your app (in Next.js: `app/layout.tsx`).

```ts
import "@syntext/react/layout";   // structure and spacing — always
import "@syntext/react/theme";    // default light and dark colours — optional
```

| Import | File | Contains |
|---|---|---|
| `@syntext/react/layout` | `index.css` | Every rule, scoped under `.se-root`, `.se-layer`, `.se-scope` and `.se-content`; spacing variables (compact and comfortable). No colours. |
| `@syntext/react/theme` | `theme.css` | Colour variables only, light and dark. Leave it out to supply every colour yourself (see [Theming](theming.md)). |
| `@syntext/react/tailwind` | `tailwind.css` | Optional. A Tailwind v4 `@theme` block that exposes the editor's colours as utilities (`bg-se-surface`…). |

Every class the library writes starts with `se-` and every variable with `--se-`, so neither collides with your
own CSS, and your global rules don't reach in.

## A first editor

```tsx
"use client";
import { useSynTextEditor } from "@syntext/react";

export function Description() {
  const editor = useSynTextEditor({
    preset: "standard",
    placeholder: "Describe the product…",
    onChange: (doc) => console.log(doc),     // a RichDoc, or null when empty
  });
  return editor.render();
}
```

`useSynTextEditor` returns the same object for the life of the component. It is the whole API: read with
`editor.getValue()`, write with `editor.setValue()`, run commands like `editor.toggleBold()`, and pass it to any
component that needs it. There is no provider.

### Controlled or uncontrolled

```tsx
// Uncontrolled: read it when you need it.
const editor = useSynTextEditor({ value: initial });
const save = () => api.save(editor.getValue());

// Controlled: value + onChange. A value different from the last one the editor reported replaces the content.
const [doc, setDoc] = useState<RichDoc | null>(null);
const editor = useSynTextEditor({ value: doc, onChange: setDoc });
<button onClick={() => setDoc(null)}>Reset</button>
```

### The component form

When you don't need the instance:

```tsx
import { SynEditor } from "@syntext/react";
<SynEditor preset="basic" placeholder="Comment…" onChange={setDoc} className="my-4" />
```

## Showing a document

```tsx
import { SynTextView } from "@syntext/react/view";

<SynTextView value={post.body} />                       // a RichDoc, its JSON string, or plain text
<SynTextView value={post.body} fallback={<em>No description.</em>} theme="dark" density="comfortable" />
```

The viewer draws React elements with the same classes the editor uses, so a document looks the same in both. It
never renders HTML from the document, so stored content can't inject markup.

For places that need HTML (email, RSS, another system):

```ts
import { toHTML } from "@syntext/react/view";
toHTML(doc);                      // classes — the page must load layout.css (+ theme.css)
toHTML(doc, { mode: "inline" });  // self-contained inline styles
```

## Next.js

- **App Router.** The main entry (`@syntext/react`) is marked `"use client"`, so import it from a client component.
  The `@syntext/react/view` entry has no hooks and no `"use client"` — use it in Server Components, route
  handlers and server actions.
- **Server rendering.** The editor's frame (toolbar, borders, status bar) renders on the server; the text appears
  when the page hydrates. Where content must be in the server HTML (SEO, first paint), render it with
  `SynTextView`.
- **Validating on the server.** `toDoc(value, schemaOf(formats))` from `@syntext/react/view` cleans any input to
  what the model and your formats allow. See [The document model](document-model.md).

```tsx
// app/posts/[id]/edit/page.tsx (server)
import { PostEditor } from "./post-editor";
export default async function Page({ params }) {
  const post = await db.post.find(params.id);
  return <PostEditor initial={post.body} />;
}

// app/posts/[id]/edit/post-editor.tsx (client)
"use client";
import { useSynTextEditor, type RichDoc } from "@syntext/react";
export function PostEditor({ initial }: { initial: RichDoc | null }) {
  const editor = useSynTextEditor({ value: initial, storage: { upload: "/api/media", list: "/api/media" } });
  return (
    <form action={async () => { await savePost(editor.getValue()); }}>
      {editor.render()}
      <button>Save</button>
    </form>
  );
}
```

## Next steps

- Pick what the editor allows → [Customization](customization.md#presets-and-formats)
- Brand it → [Theming](theming.md)
- Connect uploads → [Storage and media](storage.md)

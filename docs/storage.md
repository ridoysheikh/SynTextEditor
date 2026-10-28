# Storage and media

The editor keeps no files. You give it four operations — **upload, list, get, delete** — and it builds the media
library, uploads with progress, paste-and-drop, and replacing files on top of them. Give them as functions or as
REST endpoints.

## The contract

```ts
interface StorageAdapter {
  upload: (file: File, opts: { onProgress?: (fraction: number) => void; signal?: AbortSignal }) => Promise<Asset>;
  list:   (query: { cursor?: string | null; limit: number; search?: string; kind?: "image" | "video" | "file" }) =>
            Promise<{ items: Asset[]; next?: string | null; total?: number }>;
  get?:    (id: string) => Promise<Asset>;   // optional
  remove?: (id: string) => Promise<void>;    // optional
}

interface Asset {
  id: string;
  url: string;          // what goes into the document — must be http(s), a path, or blob:
  name: string;
  type: string;         // MIME type: decides image / video / file
  size?: number;        // bytes
  width?: number; height?: number;
  thumbnail?: string;   // a smaller image for the grid
  createdAt?: string;   // ISO date
}
```

| Operation | Used for | Without it |
|---|---|---|
| `upload` | the Upload tab, pasted and dropped files | required |
| `list` | the Library tab: grid, search, kind filter, "Load more" (`next` cursor), 24 per page | required |
| `get` | fresh details when a file is selected in the library | details show what `list` returned |
| `remove` | Delete in the library (with a confirm step) | no Delete button |

The editor never deletes a file when an image is removed from a document — documents may share files, and undo
can bring it back. Clean up unreferenced files on your server if you need to (documents record the `asset` id on
each media block).

## As REST endpoints

```ts
useSynTextEditor({
  storage: {
    baseUrl: "https://api.example.com",            // optional prefix for relative urls
    upload: "/media",                              // POST multipart/form-data, file in field "file"
    list:   "/media",                              // GET /media?limit=24&cursor=…&search=…&kind=image
    get:    "/media/:id",                          // GET
    remove: "/media/:id",                          // DELETE
    headers: async () => ({ Authorization: `Bearer ${await getToken()}` }),
    credentials: "include",                        // send cookies
  },
});
```

| Option | Type | |
|---|---|---|
| `upload` | `string \| { url, method?: "POST" \| "PUT", field? }` | default `POST`, field `"file"` |
| `list` | `string \| { url, method? }` | query params: `limit`, `cursor`, `search`, `kind` |
| `get`, `remove` | `string \| { url, method? }` | `:id` is replaced |
| `baseUrl` | `string` | prefixed to relative urls |
| `headers` | object, or a (sync or async) function | sent with every request; a function is called each time |
| `credentials` | `RequestCredentials` | `"include"` sends cookies (and `withCredentials` on uploads) |
| `mapAsset` | `(raw) => Asset` | when your API's records have other field names |
| `mapList` | `(raw) => ListResult` | when your list response has another shape |

Responses understood without mapping:

- **an asset:** the object itself, or `{ data: asset }`
- **a list:** an array of assets; or `{ items | data | results, next | next_cursor | nextCursor, total | count }`

Errors: any non-2xx status rejects; the message reaches `onError` and shows in the library or the status bar.
Uploads use `XMLHttpRequest` so progress can be reported.

## As functions

### Next.js route handlers

```ts
// app/api/media/route.ts
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file") as File;
  const saved = await blobStore.put(file);            // your storage
  return Response.json({ id: saved.id, url: saved.url, name: file.name, type: file.type, size: file.size });
}
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const page = await db.media.page({ cursor: q.get("cursor"), limit: Number(q.get("limit")), search: q.get("search"), kind: q.get("kind") });
  return Response.json({ items: page.rows, next: page.nextCursor });
}

// app/api/media/[id]/route.ts
export async function GET(_: Request, { params }) { return Response.json(await db.media.find(params.id)); }
export async function DELETE(_: Request, { params }) { await blobStore.delete(params.id); return new Response(null, { status: 204 }); }
```

```ts
storage: { upload: "/api/media", list: "/api/media", get: "/api/media/:id", remove: "/api/media/:id" }
```

### Direct to S3 (presigned URLs)

```ts
const storage: StorageAdapter = {
  async upload(file, { onProgress, signal }) {
    const { uploadUrl, asset } = await fetch("/api/media/presign", {
      method: "POST", body: JSON.stringify({ name: file.name, type: file.type, size: file.size }),
    }).then((r) => r.json());
    await new Promise<void>((ok, fail) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", uploadUrl);
      xhr.setRequestHeader("Content-Type", file.type);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
      xhr.onload = () => (xhr.status < 300 ? ok() : fail(new Error(`Upload failed (${xhr.status})`)));
      xhr.onerror = () => fail(new Error("Network error"));
      signal?.addEventListener("abort", () => xhr.abort());
      xhr.send(file);
    });
    return asset;                                     // { id, url, name, type, size }
  },
  list: (q) => fetch(`/api/media?${new URLSearchParams({ limit: String(q.limit), ...(q.cursor && { cursor: q.cursor }), ...(q.search && { search: q.search }), ...(q.kind && { kind: q.kind }) })}`).then((r) => r.json()),
  get: (id) => fetch(`/api/media/${id}`).then((r) => r.json()),
  remove: async (id) => { await fetch(`/api/media/${id}`, { method: "DELETE" }); },
};
```

### In memory

```ts
import { createMemoryStorage } from "@syntext/react";
const storage = createMemoryStorage({ latency: 600, seed: [/* Asset[] */] });
```

Files live as object URLs in the page — for demos, tests and prototypes. They don't survive a reload.

## Upload rules

```ts
useSynTextEditor({
  upload: {
    accept: "image/*,application/pdf",   // picker filter; pasted / dropped files are checked against it too
    maxSize: 10 * 1024 * 1024,           // bytes
    inlineLimit: 512 * 1024,             // without storage: embed images/video up to this size as data URLs (0 = never)
  },
});
```

A file is refused (and `onError` called) when its kind isn't in the editor's [formats](customization.md#presets-and-formats),
it doesn't match `accept`, it's over `maxSize`, or — without storage — it's a document file or over `inlineLimit`.

## Media in the editor

- **Insert:** the toolbar's image / video / file / media tools, or `editor.openGallery(kind?)`. Ctrl/⌘-click picks
  several; double-click inserts one.
- **Paste or drop** files anywhere in the editor: they upload and land where they were dropped, at the caret otherwise.
- **From a link:** the gallery's third tab, or `editor.insertImage(url)` / `insertVideo` / `insertFile`.
- **Selected image or video:** a floating bar to align, choose how text wraps around it, set the size, fit, link (image),
  edit alt text and caption, replace the file (opens the library), move up or down, or remove.
- **Resizing:** eight handles on a selected image or video. A corner keeps the proportions (hold **Shift** to free them),
  a side handle stretches one dimension (top / bottom fix the height). Sizes are px from 20 up, with no upper bound; a
  readout shows the size while dragging. *Exact size…* in the Size menu (or the details dialog) types the numbers, in px
  or as a percent of the width.
- **Behaviour:** *Break text* (own line, aligned left / centre / right) or *Wrap text* with the media on the left or
  right. **Fit** (stretch, fit inside, fill and crop) applies once a height is set.
- **Links:** an image can be a link — the floating bar's link button, Ctrl+K with it selected, or the details dialog. A
  pasted image or video address becomes the media itself with [`embedUrls`](configuration.md#behaviour).
- **Programmatically:** `editor.uploadFiles(files)` uploads and inserts; `editor.uploadFiles(files, null, false)`
  only uploads and returns the assets.

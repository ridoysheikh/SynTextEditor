/**
 * Media storage. The editor keeps no files: the host hands it four operations — upload (PUT/POST), list, get,
 * delete — either as functions (`StorageAdapter`) or as REST endpoints (`createRestStorage`). The gallery,
 * paste/drop uploads and the media tools all go through these.
 */

/** One stored file, as the host's API describes it. */
export interface Asset {
  id: string;
  /** where the file is served from — what goes into the document */
  url: string;
  name: string;
  /** MIME type, e.g. image/png */
  type: string;
  /** bytes */
  size?: number;
  width?: number;
  height?: number;
  /** a smaller image for the gallery grid */
  thumbnail?: string;
  /** ISO date */
  createdAt?: string;
}
export type AssetKind = "image" | "video" | "file";
export interface ListQuery {
  /** from the previous page's `next`; absent for the first page */
  cursor?: string | null;
  limit: number;
  search?: string;
  kind?: AssetKind;
}
export interface ListResult { items: Asset[]; next?: string | null; total?: number }
export interface UploadOptions { onProgress?: (fraction: number) => void; signal?: AbortSignal }

export interface StorageAdapter {
  upload: (file: File, opts: UploadOptions) => Promise<Asset>;
  list: (query: ListQuery) => Promise<ListResult>;
  get?: (id: string) => Promise<Asset>;
  remove?: (id: string) => Promise<void>;
}

export const kindOf = (mime: string | undefined): AssetKind =>
  mime?.startsWith("image/") ? "image" : mime?.startsWith("video/") ? "video" : "file";

// ── REST ─────────────────────────────────────────────────────────────────────

export interface RestEndpoint { url: string; method?: string }
export interface RestStorageOptions {
  /** Prefix for every relative url. */
  baseUrl?: string;
  /** Multipart upload. Default method POST; the file goes in field `field` (default "file"). */
  upload: string | (RestEndpoint & { field?: string; method?: "POST" | "PUT" });
  /** GET with ?cursor=&limit=&search=&kind= */
  list: string | RestEndpoint;
  /** GET; `:id` in the url is replaced */
  get?: string | RestEndpoint;
  /** DELETE; `:id` in the url is replaced */
  remove?: string | RestEndpoint;
  /** Sent with every request — an object, or a function for tokens that change. */
  headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>);
  credentials?: RequestCredentials;
  /** The API's record → an `Asset` (default: the record as-is, or its `data`). */
  mapAsset?: (raw: any) => Asset;
  /** The list response → items and next cursor (default: `{ items, next }`, `{ data, next_cursor }` or an array). */
  mapList?: (raw: any) => ListResult;
}

const ep = (e: string | RestEndpoint, method: string): Required<RestEndpoint> => (typeof e === "string" ? { url: e, method } : { method, ...e } as Required<RestEndpoint>);

/** Storage over four REST endpoints. */
export function createRestStorage(o: RestStorageOptions): StorageAdapter {
  const url = (u: string, id?: string) => {
    const path = id === undefined ? u : u.replace(":id", encodeURIComponent(id));
    return o.baseUrl && !/^https?:\/\//i.test(path) ? o.baseUrl.replace(/\/$/, "") + "/" + path.replace(/^\//, "") : path;
  };
  const headers = async () => (typeof o.headers === "function" ? await o.headers() : o.headers ?? {});
  const asset = o.mapAsset ?? ((raw: any) => (raw && typeof raw === "object" && "data" in raw && !("url" in raw) ? raw.data : raw) as Asset);
  const page = o.mapList ?? ((raw: any): ListResult => {
    if (Array.isArray(raw)) return { items: raw.map(asset) };
    const items = (raw.items ?? raw.data ?? raw.results ?? []) as unknown[];
    return { items: items.map(asset), next: raw.next ?? raw.next_cursor ?? raw.nextCursor ?? null, total: raw.total ?? raw.count };
  });
  const json = async (res: Response) => {
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`.trim());
    return res.status === 204 ? null : res.json();
  };

  const adapter: StorageAdapter = {
    async upload(file, { onProgress, signal }) {
      const e = typeof o.upload === "string" ? { url: o.upload, method: "POST" as const, field: "file" } : { method: "POST" as const, field: "file", ...o.upload };
      const form = new FormData();
      form.append(e.field ?? "file", file, file.name);
      const h = await headers();
      // XHR, not fetch: fetch can't report upload progress.
      return new Promise<Asset>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(e.method ?? "POST", url(e.url));
        xhr.withCredentials = o.credentials === "include";
        for (const [k, v] of Object.entries(h)) xhr.setRequestHeader(k, v);
        xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) onProgress?.(ev.loaded / ev.total); };
        xhr.onload = () => {
          if (xhr.status < 200 || xhr.status >= 300) return reject(new Error(`Upload failed (${xhr.status})`));
          try { resolve(asset(JSON.parse(xhr.responseText))); } catch { reject(new Error("Upload response wasn't JSON")); }
        };
        xhr.onerror = () => reject(new Error("Upload failed — network error"));
        xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
        signal?.addEventListener("abort", () => xhr.abort());
        xhr.send(form);
      });
    },
    async list(q) {
      const e = ep(o.list, "GET");
      const params = new URLSearchParams({ limit: String(q.limit) });
      if (q.cursor) params.set("cursor", q.cursor);
      if (q.search) params.set("search", q.search);
      if (q.kind) params.set("kind", q.kind);
      const u = url(e.url);
      const res = await fetch(`${u}${u.includes("?") ? "&" : "?"}${params}`, { method: e.method, headers: await headers(), credentials: o.credentials });
      return page(await json(res));
    },
  };
  if (o.get) {
    const e = ep(o.get, "GET");
    adapter.get = async (id) => asset(await json(await fetch(url(e.url, id), { method: e.method, headers: await headers(), credentials: o.credentials })));
  }
  if (o.remove) {
    const e = ep(o.remove, "DELETE");
    adapter.remove = async (id) => { await json(await fetch(url(e.url, id), { method: e.method, headers: await headers(), credentials: o.credentials })); };
  }
  return adapter;
}

// ── in memory ────────────────────────────────────────────────────────────────

/**
 * Storage that lives in the page (object URLs) — for demos, tests and prototypes before a backend exists.
 * `latency` (ms) makes uploads report progress over that long.
 */
export function createMemoryStorage(opts: { latency?: number; seed?: Asset[] } = {}): StorageAdapter {
  const items: Asset[] = [...(opts.seed ?? [])];
  const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((res, rej) => {
    const t = setTimeout(res, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); rej(new DOMException("Upload cancelled", "AbortError")); });
  });
  return {
    async upload(file, { onProgress, signal }) {
      const steps = 8;
      for (let i = 1; i <= steps; i++) { await wait((opts.latency ?? 600) / steps, signal); onProgress?.(i / steps); }
      const dims = file.type.startsWith("image/") ? await imageSize(file).catch(() => null) : null;
      const a: Asset = {
        id: Math.random().toString(36).slice(2, 10), url: URL.createObjectURL(file), name: file.name, type: file.type || "application/octet-stream",
        size: file.size, createdAt: new Date().toISOString(), ...(dims ?? {}),
      };
      items.unshift(a);
      return a;
    },
    async list({ cursor, limit, search, kind }) {
      await wait(150);
      const q = search?.toLowerCase();
      const all = items.filter((a) => (!kind || kindOf(a.type) === kind) && (!q || a.name.toLowerCase().includes(q)));
      const at = cursor ? Number(cursor) : 0;
      const next = at + limit < all.length ? String(at + limit) : null;
      return { items: all.slice(at, at + limit), next, total: all.length };
    },
    async get(id) {
      const a = items.find((x) => x.id === id);
      if (!a) throw new Error("Not found");
      return a;
    },
    async remove(id) {
      const i = items.findIndex((x) => x.id === id);
      if (i >= 0) { if (items[i].url.startsWith("blob:")) URL.revokeObjectURL(items[i].url); items.splice(i, 1); }
    },
  };
}

function imageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((res, rej) => {
    const img = new Image();
    const u = URL.createObjectURL(file);
    img.onload = () => { res({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(u); };
    img.onerror = () => { rej(new Error("not an image")); URL.revokeObjectURL(u); };
    img.src = u;
  });
}

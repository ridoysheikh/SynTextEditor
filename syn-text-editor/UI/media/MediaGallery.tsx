"use client";
// ─── Media library ────────────────────────────────────────────────────────────
// Browse, search, upload, inspect and delete what the host's storage holds, and insert it — all through the four
// operations the host gave (`list`, `upload`, `get`, `remove`). Without storage it offers a link, and small
// images and video embedded inline.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, File, Film, Image as ImageIcon, Link2, Loader2, RefreshCw, Search, Trash2, UploadCloud, FolderOpen } from "lucide-react";
import { safeSrc } from "../../core/model";
import { kindOf, type Asset, type AssetKind } from "../../core/storage";
import { formatBytes } from "../../core/styles";
import { blockFromAsset, type SynTextEditor } from "../../SynTextEditor";
import { Button, Field, Modal, overridable } from "../primitives";
import { useUI } from "../toolbar/tools";

type Tab = "library" | "upload" | "link";
const PAGE = 24;
const KIND_LABEL: Record<AssetKind, string> = { image: "Images", video: "Videos", file: "Files" };
const KIND_ICON = { image: ImageIcon, video: Film, file: File };

function MediaGalleryBase({ editor, filter, replace, onClose }: {
  editor: SynTextEditor;
  /** Only this kind (set when opened from the image / video / file tool). */
  filter?: AssetKind;
  /** The block index of a media block whose file is being swapped. */
  replace?: number;
  onClose: () => void;
}) {
  const storage = editor.storage;
  const replacing = replace !== undefined;
  const lockedKind = filter ?? (replacing ? (editor.getDoc().blocks[replace!]?.type as AssetKind | undefined) : undefined);
  const kinds = (["image", "video", "file"] as const).filter((k) => editor.schema.has(k));
  const [tab, setTab] = useState<Tab>(storage ? "library" : "upload");
  const [kind, setKind] = useState<AssetKind | undefined>(lockedKind);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Asset[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Asset[]>([]);
  const [detail, setDetail] = useState<Asset | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  // Debounced search.
  useEffect(() => { const t = setTimeout(() => setQuery(search.trim()), 250); return () => clearTimeout(t); }, [search]);

  const load = useCallback(async (cursor: string | null) => {
    if (!storage) return;
    const mine = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const page = await storage.list({ cursor, limit: PAGE, search: query || undefined, kind });
      if (mine !== seq.current) return;                    // a newer search answered first
      setItems((prev) => (cursor ? [...prev, ...page.items] : page.items));
      setNext(page.next ?? null);
    } catch (e) {
      if (mine === seq.current) setError((e as Error).message || "Couldn't load the library");
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [storage, query, kind]);
  useEffect(() => { if (tab === "library") void load(null); }, [load, tab]);

  const toggle = (a: Asset, multi: boolean) => {
    setConfirm(null);
    setPicked((p) => {
      const has = p.some((x) => x.id === a.id);
      if (!multi || replacing) return has && p.length === 1 ? [] : [a];
      return has ? p.filter((x) => x.id !== a.id) : [...p, a];
    });
    setDetail(a);
    // Fresh details from the host (dimensions, date) when it offers `get`.
    if (storage?.get) storage.get(a.id).then((fresh) => setDetail((d) => (d?.id === a.id ? { ...a, ...fresh } : d))).catch(() => {});
  };

  const remove = async (a: Asset) => {
    if (!storage?.remove) return;
    if (confirm !== a.id) { setConfirm(a.id); return; }
    setBusy(true);
    try {
      await storage.remove(a.id);
      setItems((xs) => xs.filter((x) => x.id !== a.id));
      setPicked((xs) => xs.filter((x) => x.id !== a.id));
      setDetail(null);
      setConfirm(null);
    } catch (e) {
      editor.fail(e as Error);
      setError(`Couldn't delete ${a.name}: ${(e as Error).message}`);
    } finally { setBusy(false); }
  };

  const insert = (assets: Asset[]) => {
    if (!assets.length) return;
    if (replacing) {
      const a = assets[0];
      const b = blockFromAsset(a);
      editor.engine?.updateAtom({ src: b.src, asset: a.id, ...(b.type === "file" ? { name: b.name, mime: b.mime, bytes: b.bytes } : {}) }, replace!);
    } else for (const a of assets) editor.insertAsset(a);
    onClose();
  };

  const onUploaded = (assets: Asset[]) => {
    if (!assets.length) return;
    if (!storage) { insert(assets); return; }                       // inline files: nothing to browse — straight in
    setItems((xs) => [...assets, ...xs.filter((x) => !assets.some((a) => a.id === x.id))]);
    setPicked(replacing ? assets.slice(0, 1) : assets);
    setDetail(assets[0]);
    setTab("library");
  };

  const title = replacing ? "Replace file" : lockedKind ? `Insert ${lockedKind === "file" ? "file" : lockedKind}` : "Media library";
  return (
    <Modal title={title} onClose={onClose} width={860}
      footer={
        <>
          {tab === "library" && <span className="se-hint">{picked.length ? `${picked.length} selected` : storage ? "Click to select · Ctrl/⌘-click for several" : ""}</span>}
          <span className="se-tb-spacer" />
          <Button onClick={onClose}>Cancel</Button>
          {tab === "library" && <Button tone="primary" disabled={!picked.length} onClick={() => insert(picked)}>{replacing ? "Replace" : picked.length > 1 ? `Insert ${picked.length}` : "Insert"}</Button>}
        </>
      }>
      <div className="se-tabs" role="tablist">
        {storage && <TabButton id="library" tab={tab} setTab={setTab} icon={<FolderOpen />}>Library</TabButton>}
        <TabButton id="upload" tab={tab} setTab={setTab} icon={<UploadCloud />}>Upload</TabButton>
        <TabButton id="link" tab={tab} setTab={setTab} icon={<Link2 />}>From a link</TabButton>
      </div>
      <div className="se-modal-body" style={{ minHeight: 300 }}>
        {tab === "library" && storage && (
          <>
            <div className="se-gallery-bar">
              <div style={{ position: "relative", flex: 1, minWidth: 160 }}>
                <Search size={15} style={{ position: "absolute", left: 10, top: 10, color: "var(--se-muted)" }} />
                <input className="se-input" style={{ paddingLeft: 32 }} placeholder="Search files" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search files" />
              </div>
              {!lockedKind && kinds.length > 1 && (
                <div className="se-seg" role="group" aria-label="Kind">
                  <button type="button" aria-pressed={!kind} onClick={() => setKind(undefined)}>All</button>
                  {kinds.map((k) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>)}
                </div>
              )}
              <Button size="sm" tone="ghost" aria-label="Refresh" onClick={() => load(null)}><RefreshCw /></Button>
            </div>
            {error && <p className="se-error" role="alert">{error}</p>}
            {!items.length && !loading && !error && (
              <div className="se-empty">
                <FolderOpen />
                <div>{query ? `Nothing matches “${query}”.` : "Nothing here yet."}</div>
                <div style={{ marginTop: 10 }}><Button size="sm" onClick={() => setTab("upload")}><UploadCloud /> Upload files</Button></div>
              </div>
            )}
            <div className="se-gallery" role="listbox" aria-multiselectable={!replacing}>
              {items.map((a) => <Tile key={a.id} asset={a} picked={picked.some((p) => p.id === a.id)} onPick={(multi) => toggle(a, multi)} onOpen={() => insert([a])} />)}
            </div>
            {loading && <div className="se-empty" style={{ padding: 20 }}><Loader2 className="se-spin" /></div>}
            {next && !loading && <div style={{ textAlign: "center", marginTop: 12 }}><Button size="sm" onClick={() => load(next)}>Load more</Button></div>}
            {detail && (
              <div className="se-detail">
                <div className="se-detail-thumb">
                  {kindOf(detail.type) === "image" ? <img src={detail.thumbnail ?? detail.url} alt="" /> : (() => { const I = KIND_ICON[kindOf(detail.type)]; return <I size={28} />; })()}
                </div>
                <div className="se-stack" style={{ gap: 8, minWidth: 0 }}>
                  <dl>
                    <dt>Name</dt><dd>{detail.name}</dd>
                    <dt>Type</dt><dd>{detail.type}</dd>
                    {detail.size !== undefined && <><dt>Size</dt><dd>{formatBytes(detail.size)}</dd></>}
                    {detail.width && detail.height && <><dt>Dimensions</dt><dd>{detail.width} × {detail.height}</dd></>}
                    {detail.createdAt && <><dt>Added</dt><dd>{new Date(detail.createdAt).toLocaleString()}</dd></>}
                    <dt>URL</dt><dd data-long><a href={detail.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--se-link)" }}>{detail.url}</a></dd>
                  </dl>
                  {storage.remove && (
                    <div className="se-row">
                      <Button size="sm" tone="danger" disabled={busy} onClick={() => remove(detail)}><Trash2 />{confirm === detail.id ? "Delete for good?" : "Delete"}</Button>
                      {confirm === detail.id && <Button size="sm" tone="ghost" onClick={() => setConfirm(null)}>Keep it</Button>}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
        {tab === "upload" && <UploadPane editor={editor} kind={lockedKind} multiple={!replacing} onDone={onUploaded} />}
        {tab === "link" && <LinkPane editor={editor} kind={lockedKind} onInsert={(a) => insert([a])} />}
      </div>
    </Modal>
  );
}

function TabButton({ id, tab, setTab, icon, children }: { id: Tab; tab: Tab; setTab: (t: Tab) => void; icon: ReactNode; children: ReactNode }) {
  return <button type="button" role="tab" className="se-tab" aria-selected={tab === id} onClick={() => setTab(id)}>{icon}{children}</button>;
}

function Tile({ asset: a, picked, onPick, onOpen }: { asset: Asset; picked: boolean; onPick: (multi: boolean) => void; onOpen: () => void }) {
  const k = kindOf(a.type);
  const Icon = KIND_ICON[k];
  return (
    <button type="button" role="option" className="se-tile" aria-pressed={picked} aria-selected={picked}
      onClick={(e) => onPick(e.ctrlKey || e.metaKey || e.shiftKey)} onDoubleClick={onOpen}>
      <span className="se-tile-thumb">
        {k === "image" ? <img src={a.thumbnail ?? a.url} alt="" loading="lazy" draggable={false} />
          : k === "video" && !a.thumbnail ? <video src={a.url} muted preload="metadata" />
          : a.thumbnail ? <img src={a.thumbnail} alt="" loading="lazy" /> : <Icon />}
        {k !== "image" && <span className="se-tile-kind">{k === "video" ? "video" : (a.name.split(".").pop() ?? "file").slice(0, 5)}</span>}
        {picked && <span className="se-tile-check"><Check /></span>}
      </span>
      <span className="se-tile-meta">
        <span className="se-tile-name">{a.name}</span>
        <span className="se-tile-sub">{[formatBytes(a.size), a.width && a.height ? `${a.width}×${a.height}` : ""].filter(Boolean).join(" · ") || " "}</span>
      </span>
    </button>
  );
}

function UploadPane({ editor, kind, multiple, onDone }: { editor: SynTextEditor; kind?: AssetKind; multiple: boolean; onDone: (a: Asset[]) => void }) {
  const ui = useUI(editor);
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const accept = kind === "image" ? "image/*" : kind === "video" ? "video/*" : editor.uploadConfig.accept;
  const go = async (list: FileList | null) => {
    const files = Array.from(list ?? []).slice(0, multiple ? undefined : 1);
    if (!files.length) return;
    const bad = files.map((f) => (kind && kindOf(f.type) !== kind ? `${f.name} isn't ${kind === "image" ? "an image" : `a ${kind}`}` : editor.accepts(f))).filter((p): p is string => !!p);
    setProblems(bad);
    const ok = files.filter((f) => (!kind || kindOf(f.type) === kind) && !editor.accepts(f));
    if (ok.length) onDone(await editor.uploadFiles(ok, null, false));
  };
  const limit = editor.storage ? editor.uploadConfig.maxSize : editor.uploadConfig.inlineLimit;
  return (
    <div>
      <div className="se-drop" data-over={over ? "" : undefined} role="button" tabIndex={0}
        onClick={() => input.current?.click()} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void go(e.dataTransfer.files); }}>
        <UploadCloud />
        <strong>Drop {multiple ? "files" : "a file"} here, or click to choose</strong>
        <span className="se-hint">
          {kind ? KIND_LABEL[kind] : "Images, video and documents"} · up to {formatBytes(limit)}
          {!editor.storage && " · embedded in the document (no storage configured)"}
        </span>
        <input ref={input} type="file" hidden accept={accept} multiple={multiple} onChange={(e) => { void go(e.target.files); e.target.value = ""; }} />
      </div>
      {problems.map((p) => <p key={p} className="se-error" role="alert">{p}</p>)}
      {ui.uploads.length > 0 && (
        <div className="se-uploads">
          {ui.uploads.map((u) => (
            <div key={u.id} className="se-upload-row">
              <span>{u.name}</span>
              {u.error ? <span className="se-error">{u.error}</span> : (
                <><span className="se-progress-track"><span className="se-progress-fill" style={{ width: `${Math.round(u.progress * 100)}%`, display: "block" }} /></span>
                  <span className="se-hint" style={{ width: 36, textAlign: "right" }}>{Math.round(u.progress * 100)}%</span></>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LinkPane({ editor, kind, onInsert }: { editor: SynTextEditor; kind?: AssetKind; onInsert: (a: Asset) => void }) {
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const guess = useMemo<AssetKind>(() => {
    if (kind) return kind;
    const path = url.split(/[?#]/)[0].toLowerCase();
    if (/\.(png|jpe?g|gif|webp|avif|svg|bmp)$/.test(path)) return "image";
    if (/\.(mp4|webm|ogg|mov|m4v)$/.test(path)) return "video";
    if (/\.[a-z0-9]{2,5}$/.test(path)) return "file";
    return "image";
  }, [url, kind]);
  const [as, setAs] = useState<AssetKind | null>(null);
  const k = kind ?? as ?? guess;
  const src = safeSrc(url);
  const kinds = (["image", "video", "file"] as const).filter((x) => editor.schema.has(x));
  return (
    <form className="se-stack" onSubmit={(e) => {
      e.preventDefault();
      if (!src) return;
      const name = text || decodeURIComponent(src.split(/[?#]/)[0].split("/").pop() || "file");
      onInsert({ id: "", url: src, name: k === "image" ? text || "" : name, type: k === "image" ? "image/*" : k === "video" ? "video/*" : "application/octet-stream" });
    }}>
      <Field label="Address"><input className="se-input" data-autofocus placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} aria-invalid={!!url && !src} /></Field>
      {!kind && kinds.length > 1 && (
        <div className="se-seg" role="group" aria-label="Insert as" style={{ alignSelf: "flex-start" }}>
          {kinds.map((x) => <button key={x} type="button" aria-pressed={k === x} onClick={() => setAs(x)}>{x === "image" ? "Image" : x === "video" ? "Video" : "File"}</button>)}
        </div>
      )}
      {k !== "video" && (
        <Field label={k === "image" ? "Alt text (describes the image)" : "Name shown"}>
          <input className="se-input" value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
      )}
      {src && k === "image" && <div className="se-preview-frame" style={{ padding: 8, textAlign: "center" }}><img src={src} alt="" style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 6 }} /></div>}
      {url && !src && <p className="se-error">That address can't be used — it must start with https://</p>}
      <div><Button tone="primary" type="submit" disabled={!src}>Insert</Button></div>
    </form>
  );
}
export const MediaGallery = overridable("MediaGallery", MediaGalleryBase);

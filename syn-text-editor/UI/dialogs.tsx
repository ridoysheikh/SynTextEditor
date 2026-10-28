"use client";
// ─── Dialogs and bars ─────────────────────────────────────────────────────────
// The link dialog, media details, preview, the find bar and the status bar. Each takes the editor instance.

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Camera, CaseSensitive, ChevronDown, ChevronUp, Copy, ExternalLink, Images, Loader2, Unlink, Upload, X } from "lucide-react";
import { toHTML } from "../core/html";
import { MEDIA_MAX, MEDIA_MIN, safeLink } from "../core/model";
import { isCollapsed } from "../core/ops";
import { useEditorValue } from "../hooks";
import type { SynTextEditor } from "../SynTextEditor";
import { captureFrame } from "../view/player";
import { SynTextView } from "../view/SynTextView";
import { VideoPlayer as DefaultVideoPlayer } from "../view/VideoPlayer";
import { Button, Field, Modal, ToolButton, cx, overridable } from "./primitives";
import { keys, useToolState, useUI } from "./toolbar/tools";

/** The video player of the dialog preview. Slot `VideoPlayer`. */
const VideoPlayer = overridable("VideoPlayer", DefaultVideoPlayer);

function LinkDialogBase({ editor, onClose }: { editor: SynTextEditor; onClose: () => void }) {
  const [state] = useState(() => editor.getState());
  const sel = editor.getSelection();
  // An image selected as a whole is linked itself; otherwise it is the link under the caret or selection.
  const picture = state?.atom != null ? editor.getDoc().blocks[state.atom] : null;
  const current = picture?.type === "image" ? picture.link : picture ? undefined : state?.link ?? undefined;
  const bare = !picture && !!sel && isCollapsed(sel) && !state?.link;
  const [href, setHref] = useState(current ?? "");
  const [text, setText] = useState("");
  const safe = safeLink(href);
  const apply = () => {
    if (href.trim() && !safe) return;
    onClose();
    requestAnimationFrame(() => editor.setLink(safe, bare ? text : undefined));
  };
  return (
    <Modal title={current ? "Edit link" : "Add link"} onClose={onClose} width={440} kind="link" variant={editor.dialogVariant("link")}
      footer={
        <>
          {current && <Button tone="danger" onClick={() => { onClose(); requestAnimationFrame(() => editor.setLink(undefined)); }}><Unlink />Remove link</Button>}
          <span className="se-tb-spacer" />
          <Button onClick={onClose}>Cancel</Button>
          <Button tone="primary" disabled={!safe} onClick={apply}>Apply</Button>
        </>
      }>
      <form className="se-modal-body se-stack" onSubmit={(e) => { e.preventDefault(); apply(); }}>
        <Field label="Address">
          <input className="se-input" data-autofocus placeholder="https://… · mailto: · tel:" value={href} onChange={(e) => setHref(e.target.value)} aria-invalid={!!href.trim() && !safe} />
        </Field>
        {bare && (
          <Field label="Text to show">
            <input className="se-input" placeholder={safe ?? "Defaults to the address"} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
        )}
        {href.trim() && !safe && <p className="se-error">Use a web address, mailto: or tel:</p>}
        {safe && <a className="se-hint" href={safe} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><ExternalLink size={12} />Open {safe}</a>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function MediaDetailsDialogBase({ editor, index, onClose }: { editor: SynTextEditor; index: number; onClose: () => void }) {
  const block = editor.getDoc().blocks[index];
  const [alt, setAlt] = useState(block?.alt ?? "");
  const [caption, setCaption] = useState(block?.caption ?? "");
  const [name, setName] = useState(block?.name ?? "");
  const [poster, setPoster] = useState(block?.poster);
  // Size: a width in px (free, not bounded by the page) or as a percent of it, and an optional fixed height.
  const [unit, setUnit] = useState<"px" | "%">(block?.width && !block.w ? "%" : "px");
  const [wv, setWv] = useState(block?.w ? String(block.w) : block?.width ? String(block.width) : "");
  const [hv, setHv] = useState(block?.h ? String(block.h) : "");
  const [keep, setKeep] = useState(true);
  const [fit, setFit] = useState<"contain" | "cover" | undefined>(block?.fit);
  const [place, setPlace] = useState<"left" | "center" | "right">(block?.align === "left" || block?.align === "right" ? block.align : "center");
  const [wrap, setWrap] = useState(!!block?.wrap);
  const [link, setLink] = useState(block?.link ?? "");
  // The picture's proportions: its own when it has loaded, what is drawn until then.
  const drawn = editor.engine?.elementOf(index)?.querySelector<HTMLElement>("img, .se-player")?.getBoundingClientRect();
  const [ratio, setRatio] = useState(drawn && drawn.height ? drawn.width / drawn.height : 0);
  if (!block) return null;
  const media = block.type === "image" || block.type === "video";
  const num = (v: string) => { const n = Number(v); return v.trim() && Number.isFinite(n) && n > 0 ? n : undefined; };
  const safeLinkValue = link.trim() ? safeLink(link) : undefined;
  const badLink = !!link.trim() && !safeLinkValue;
  const setWidth = (v: string) => {
    setWv(v.replace(/[^\d]/g, ""));
    const n = num(v);
    if (keep && unit === "px" && n && ratio && hv) setHv(String(Math.round(n / ratio)));
  };
  const setHeight = (v: string) => {
    setHv(v.replace(/[^\d]/g, ""));
    const n = num(v);
    if (keep && unit === "px" && n && ratio && wv) setWv(String(Math.round(n * ratio)));
  };
  const switchUnit = (u: "px" | "%") => {
    if (u === unit) return;
    setUnit(u);
    if (u === "%") setHv("");                                         // a percent width follows the page: a fixed height would distort it
    setWv(u === "px" && drawn?.width ? String(Math.round(drawn.width)) : "");
  };
  const patch = (): Partial<import("../core/model").Block> => {
    if (block.type === "file") return { name: name.trim() || undefined };
    const wn = num(wv);
    const hn = num(hv);
    return {
      alt: block.type === "image" ? alt.trim() || undefined : undefined,
      caption: caption.trim() || undefined,
      ...(unit === "px" ? { w: wn, width: undefined } : { width: wn, w: undefined }),
      h: hn,
      fit: hn ? fit : undefined,
      align: place === "center" ? undefined : place,
      wrap: wrap && place !== "center" ? true : undefined,
      ...(block.type === "image" ? { link: safeLinkValue } : {}),
      ...(block.type === "video" ? { poster } : {}),
    };
  };
  const save = () => {
    if (badLink) return;
    const p = patch();
    onClose();
    requestAnimationFrame(() => editor.engine?.updateAtom(p, index));
  };
  // The library replaces this dialog for a moment: keep what was edited, and it comes back here after.
  const library = () => { editor.engine?.updateAtom(patch(), index); editor.openThumbnailLibrary(index); };
  const reset = () => { setWv(""); setHv(""); setFit(undefined); };
  return (
    <Modal title={block.type === "file" ? "File details" : block.type === "video" ? "Video details" : "Image details"} onClose={onClose} width={520} kind="media" variant={editor.dialogVariant("media")}
      footer={<><span className="se-tb-spacer" /><Button onClick={onClose}>Cancel</Button><Button tone="primary" disabled={badLink} onClick={save}>Save</Button></>}>
      <form className="se-modal-body se-stack" onSubmit={(e) => { e.preventDefault(); save(); }}>
        {block.type === "image" && (
          <>
            <div className="se-preview-frame" style={{ padding: 8, textAlign: "center" }}>
              <img src={block.src} alt="" style={{ maxWidth: "100%", maxHeight: 180, borderRadius: 6 }}
                onLoad={(e) => { const i = e.currentTarget; if (i.naturalWidth && i.naturalHeight) setRatio(i.naturalWidth / i.naturalHeight); }} />
            </div>
            <Field label="Alt text — what the image shows, for screen readers"><input className="se-input" data-autofocus value={alt} onChange={(e) => setAlt(e.target.value)} /></Field>
          </>
        )}
        {block.type === "video" && <VideoThumbnail editor={editor} src={block.src ?? ""} poster={poster} onPoster={setPoster} onLibrary={library} />}
        {media && (
          <>
            <Field label="Caption"><input className="se-input" value={caption} onChange={(e) => setCaption(e.target.value)} /></Field>
            <div className="se-field">
              <span>Size</span>
              <div className="se-size-grid">
                <div className="se-inline">
                  <input className="se-input" inputMode="numeric" aria-label="Width" placeholder="Auto" value={wv} onChange={(e) => setWidth(e.target.value)} />
                  <div className="se-seg" role="group" aria-label="Width unit">
                    {(["px", "%"] as const).map((u) => <button key={u} type="button" aria-pressed={unit === u} onClick={() => switchUnit(u)}>{u}</button>)}
                  </div>
                </div>
                <span className="se-times" aria-hidden>×</span>
                <div className="se-inline">
                  <input className="se-input" inputMode="numeric" aria-label="Height in px" placeholder="Auto" value={hv} disabled={unit === "%"} onChange={(e) => setHeight(e.target.value)} />
                  <span className="se-unit">px</span>
                </div>
              </div>
              <p className="se-hint">
                {unit === "px" ? `${MEDIA_MIN}–${MEDIA_MAX} px, free of the page width.` : "5–100 % of the page width."} Leave the height on Auto to keep the proportions.
              </p>
            </div>
            <div className="se-row-opts">
              <label className="se-check"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} disabled={unit === "%"} />Keep proportions while typing</label>
              <Button size="sm" tone="ghost" onClick={reset}>Original size</Button>
            </div>
            {hv && (
              <div className="se-field">
                <span>When the box is not the picture's shape</span>
                <div className="se-seg" role="group" aria-label="Fit" style={{ alignSelf: "flex-start" }}>
                  {([[undefined, "Stretch"], ["contain", "Fit inside"], ["cover", "Fill and crop"]] as const).map(([v, label]) => (
                    <button key={label} type="button" aria-pressed={fit === v} onClick={() => setFit(v)}>{label}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="se-field">
              <span>Position</span>
              <div className="se-inline" style={{ flexWrap: "wrap" }}>
                <div className="se-seg" role="group" aria-label="Position">
                  {(["left", "center", "right"] as const).map((v) => <button key={v} type="button" aria-pressed={place === v} onClick={() => setPlace(v)}>{v[0].toUpperCase() + v.slice(1)}</button>)}
                </div>
                <label className="se-check" style={place === "center" ? { opacity: .5 } : undefined}>
                  <input type="checkbox" checked={wrap && place !== "center"} disabled={place === "center"} onChange={(e) => setWrap(e.target.checked)} />Text wraps around it
                </label>
              </div>
            </div>
            {block.type === "image" && (
              <Field label="Link — where a click on the picture goes">
                <input className="se-input" placeholder="https://… · mailto: · tel:" value={link} onChange={(e) => setLink(e.target.value)} aria-invalid={badLink} />
              </Field>
            )}
            {badLink && <p className="se-error">Use a web address, mailto: or tel:</p>}
          </>
        )}
        {block.type === "file" && <Field label="Name shown"><input className="se-input" data-autofocus value={name} onChange={(e) => setName(e.target.value)} /></Field>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

/** A video's preview, and its thumbnail: the frame on screen, an uploaded image, one from the library, or none. */
function VideoThumbnail({ editor, src, poster, onPoster, onLibrary }: {
  editor: SynTextEditor; src: string; poster: string | undefined; onPoster: (p: string | undefined) => void; onLibrary: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"frame" | "upload" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const run = async (kind: "frame" | "upload", make: () => Promise<File | null>) => {
    setBusy(kind);
    setProblem(null);
    try {
      const f = await make();
      if (!f) return;
      const url = await editor.uploadThumbnail(f);
      if (url) onPoster(url); else setProblem("The image couldn't be stored");
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const frame = () => run("frame", async () => {
    const video = box.current?.querySelector("video");
    if (!video) return null;
    video.pause();
    const blob = await captureFrame(video);
    return new File([blob], `thumbnail-${Math.round(video.currentTime * 10) / 10}s.jpg`, { type: blob.type || "image/jpeg" });
  });
  return (
    <>
      <div ref={box} className="se-thumb-preview se-content se-figure"><VideoPlayer src={src} poster={poster} label="Preview" /></div>
      <div className="se-field">
        <span>Thumbnail — shown before the video plays</span>
        <div className="se-thumb-row">
          <span className="se-thumb" data-empty={poster ? undefined : ""}>
            {poster ? <img src={poster} alt="" /> : <span>First frame</span>}
          </span>
          <div className="se-thumb-actions">
            <Button size="sm" onClick={frame} disabled={!!busy}>
              {busy === "frame" ? <Loader2 className="se-spin" /> : <Camera />}Use current frame
            </Button>
            <Button size="sm" onClick={() => file.current?.click()} disabled={!!busy}>
              {busy === "upload" ? <Loader2 className="se-spin" /> : <Upload />}Upload image
            </Button>
            <Button size="sm" onClick={onLibrary} disabled={!!busy}><Images />{editor.storage ? "Library…" : "From a link…"}</Button>
            {poster && <Button size="sm" tone="ghost" onClick={() => onPoster(undefined)} disabled={!!busy}><X />Remove</Button>}
          </div>
          <input ref={file} type="file" hidden accept="image/*"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void run("upload", async () => f); }} />
        </div>
        {problem && <p className="se-error" role="alert">{problem}</p>}
        <span className="se-hint">Play or scrub the preview to the moment you want, then “Use current frame”.</span>
      </div>
    </>
  );
}

function PreviewDialogBase({ editor, onClose }: { editor: SynTextEditor; onClose: () => void }) {
  const [tab, setTab] = useState<"preview" | "html" | "json">("preview");
  const [mode, setMode] = useState<"class" | "inline">("class");
  const [copied, setCopied] = useState(false);
  const doc = editor.getDoc();
  const source = tab === "html" ? toHTML(doc, { mode }) : JSON.stringify(doc, null, 2);
  const copy = async () => {
    try { await navigator.clipboard.writeText(source); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };
  const dark = editor.config.theme === "dark" ? "dark" : editor.config.theme === "light" ? "light" : "inherit";
  return (
    <Modal title="Preview" onClose={onClose} width={900} kind="preview" variant={editor.dialogVariant("preview")}>
      <div className="se-tabs" role="tablist">
        {(["preview", "html", "json"] as const).map((t) => (
          <button key={t} type="button" role="tab" className="se-tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t === "preview" ? "Preview" : t.toUpperCase()}</button>
        ))}
      </div>
      <div className="se-modal-body">
        {tab === "preview" ? (
          <div className="se-preview-frame"><SynTextView value={doc} theme={dark} fallback={<p className="se-hint">Nothing written yet.</p>} /></div>
        ) : (
          <div className="se-stack">
            <div className="se-row">
              {tab === "html" && (
                <div className="se-seg" role="group" aria-label="HTML style">
                  <button type="button" aria-pressed={mode === "class"} onClick={() => setMode("class")}>Classes</button>
                  <button type="button" aria-pressed={mode === "inline"} onClick={() => setMode("inline")}>Inline styles</button>
                </div>
              )}
              <span className="se-tb-spacer" style={{ flex: 1 }} />
              <Button size="sm" onClick={copy}><Copy />{copied ? "Copied" : "Copy"}</Button>
            </div>
            <pre className="se-source">{source}</pre>
          </div>
        )}
      </div>
    </Modal>
  );
}

function FindBarBase({ editor }: { editor: SynTextEditor }) {
  const [q, setQ] = useState("");
  const [r, setR] = useState("");
  const [cs, setCs] = useState(false);
  const [pos, setPos] = useState<{ index: number; total: number }>({ index: 0, total: 0 });
  const input = useRef<HTMLInputElement>(null);
  const version = useEditorValue(editor, ["change"], (e) => e.getDoc());
  useEffect(() => { input.current?.focus(); input.current?.select(); }, []);
  useEffect(() => {
    const total = editor.engine?.find(q, cs) ?? 0;
    setPos((p) => ({ index: Math.min(p.index, total), total }));
  }, [editor, q, cs, version]);
  useEffect(() => () => editor.engine?.clearFind(), [editor]);
  const next = (back = false) => { const n = editor.engine?.findNext(q, cs, back); if (n) setPos(n); };
  return (
    <div className="se-findbar" role="search" onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); editor.toggleFind(false); } }}>
      <input ref={input} className="se-input" placeholder="Find" aria-label="Find" value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); next(e.shiftKey); } }} />
      <span className="se-findbar-count" aria-live="polite">{q ? `${pos.index || "–"} / ${pos.total}` : ""}</span>
      <ToolButton label="Previous" kbd="Shift+Enter" disabled={!pos.total} onClick={() => next(true)}><ChevronUp /></ToolButton>
      <ToolButton label="Next" kbd="Enter" disabled={!pos.total} onClick={() => next()}><ChevronDown /></ToolButton>
      <ToolButton label="Match case" active={cs} onClick={() => setCs((c) => !c)}><CaseSensitive /></ToolButton>
      {!editor.isReadOnly() && (
        <>
          <input className="se-input" placeholder="Replace with" aria-label="Replace with" value={r} onChange={(e) => setR(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const n = editor.engine?.replaceNext(q, r, cs); if (n) setPos(n); } }} />
          <Button size="sm" disabled={!pos.total} onClick={() => { const n = editor.engine?.replaceNext(q, r, cs); if (n) setPos(n); }}>Replace</Button>
          <Button size="sm" disabled={!pos.total} onClick={() => { editor.engine?.replaceAll(q, r, cs); setPos({ index: 0, total: 0 }); }}>All</Button>
        </>
      )}
      <span style={{ flex: 1 }} />
      <ToolButton label="Close" kbd="Esc" onClick={() => editor.toggleFind(false)}><X /></ToolButton>
    </div>
  );
}

function StatusBarBase({ editor, className, style }: { editor: SynTextEditor; className?: string; style?: CSSProperties }) {
  const { state } = useToolState(editor);
  const ui = useUI(editor);
  const max = editor.config.maxLength;
  const len = state?.length ?? editor.getLength();
  const busy = ui.uploads.filter((u) => !u.error);
  const failed = ui.uploads.filter((u) => u.error);
  const progress = busy.length ? busy.reduce((n, u) => n + u.progress, 0) / busy.length : 0;
  return (
    <div className={cx("se-statusbar", className)} style={style}>
      <span>{(state?.words ?? editor.getWords()).toLocaleString()} words</span>
      <span data-over={max && len > max ? "" : undefined}>{len.toLocaleString()}{max ? ` / ${max.toLocaleString()}` : ""} characters</span>
      {busy.length > 0 && (
        <span className="se-progress" aria-live="polite">
          Uploading {busy.length > 1 ? `${busy.length} files` : busy[0].name}
          <span className="se-progress-track"><span className="se-progress-fill" style={{ display: "block", width: `${Math.round(progress * 100)}%` }} /></span>
        </span>
      )}
      {failed.map((u) => <span key={u.id} className="se-error">{u.name}: {u.error}</span>)}
      <span className="se-tb-spacer" />
      {editor.isReadOnly() && <span>Read only</span>}
      {state?.cell && <span>Table · row {state.cell.r + 1}, column {state.cell.c + 1} · Tab for next cell</span>}
      {!state?.cell && state?.atom == null && <span className="se-hint" style={{ fontSize: 11 }}>{keys("Ctrl+Shift+V")} pastes plain text</span>}
    </div>
  );
}
export const LinkDialog = overridable("LinkDialog", LinkDialogBase);
export const MediaDetailsDialog = overridable("MediaDetailsDialog", MediaDetailsDialogBase);
export const PreviewDialog = overridable("PreviewDialog", PreviewDialogBase);
export const FindBar = overridable("FindBar", FindBarBase);
export const StatusBar = overridable("StatusBar", StatusBarBase);

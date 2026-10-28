"use client";
// ─── Dialogs and bars ─────────────────────────────────────────────────────────
// The link dialog, media details, preview, the find bar and the status bar. Each takes the editor instance.

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Camera, CaseSensitive, ChevronDown, ChevronUp, Copy, ExternalLink, Images, Loader2, Unlink, Upload, X } from "lucide-react";
import { toHTML } from "../core/html";
import { clampWidth, safeLink } from "../core/model";
import { isCollapsed } from "../core/ops";
import { useEditorValue } from "../hooks";
import type { SynTextEditor } from "../SynTextEditor";
import { captureFrame } from "../view/player";
import { SynTextView } from "../view/SynTextView";
import { VideoPlayer as DefaultVideoPlayer } from "../view/VideoPlayer";
import { Button, Field, Modal, Slider, ToolButton, cx, overridable } from "./primitives";
import { keys, useToolState, useUI } from "./toolbar/tools";

/** The video player of the dialog preview. Slot `VideoPlayer`. */
const VideoPlayer = overridable("VideoPlayer", DefaultVideoPlayer);

function LinkDialogBase({ editor, onClose }: { editor: SynTextEditor; onClose: () => void }) {
  const [state] = useState(() => editor.getState());
  const sel = editor.getSelection();
  const bare = !!sel && isCollapsed(sel) && !state?.link;
  const [href, setHref] = useState(state?.link ?? "");
  const [text, setText] = useState("");
  const safe = safeLink(href);
  const apply = () => {
    if (href.trim() && !safe) return;
    onClose();
    requestAnimationFrame(() => editor.setLink(safe, bare ? text : undefined));
  };
  return (
    <Modal title={state?.link ? "Edit link" : "Add link"} onClose={onClose} width={440}
      footer={
        <>
          {state?.link && <Button tone="danger" onClick={() => { onClose(); requestAnimationFrame(() => editor.setLink(undefined)); }}><Unlink />Remove link</Button>}
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
  const [width, setWidth] = useState(block?.width ?? 100);
  const [poster, setPoster] = useState(block?.poster);
  if (!block) return null;
  const patch = () => block.type === "file"
    ? { name: name.trim() || undefined }
    : {
        alt: block.type === "image" ? alt.trim() || undefined : undefined, caption: caption.trim() || undefined, width: clampWidth(width),
        ...(block.type === "video" ? { poster } : {}),
      };
  const save = () => {
    const p = patch();
    onClose();
    requestAnimationFrame(() => editor.engine?.updateAtom(p, index));
  };
  // The library replaces this dialog for a moment: keep what was edited, and it comes back here after.
  const library = () => { editor.engine?.updateAtom(patch(), index); editor.openThumbnailLibrary(index); };
  return (
    <Modal title={block.type === "file" ? "File details" : block.type === "video" ? "Video details" : "Image details"} onClose={onClose} width={480}
      footer={<><span className="se-tb-spacer" /><Button onClick={onClose}>Cancel</Button><Button tone="primary" onClick={save}>Save</Button></>}>
      <form className="se-modal-body se-stack" onSubmit={(e) => { e.preventDefault(); save(); }}>
        {block.type === "image" && (
          <>
            <div className="se-preview-frame" style={{ padding: 8, textAlign: "center" }}>
              <img src={block.src} alt="" style={{ maxWidth: "100%", maxHeight: 180, borderRadius: 6 }} />
            </div>
            <Field label="Alt text — what the image shows, for screen readers"><input className="se-input" data-autofocus value={alt} onChange={(e) => setAlt(e.target.value)} /></Field>
          </>
        )}
        {block.type === "video" && <VideoThumbnail editor={editor} src={block.src ?? ""} poster={poster} onPoster={setPoster} onLibrary={library} />}
        {block.type !== "file" && (
          <>
            <Field label="Caption"><input className="se-input" value={caption} onChange={(e) => setCaption(e.target.value)} /></Field>
            <Field label={`Width — ${width}%`}>
              <Slider label="Width" min={10} max={100} step={5} value={width} valueText={`${width}%`} onChange={setWidth} />
            </Field>
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
    <Modal title="Preview" onClose={onClose} width={900}>
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

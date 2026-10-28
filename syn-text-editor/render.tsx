"use client";
// ─── The editor's UI ──────────────────────────────────────────────────────────
// What `editor.render()` mounts: toolbar, find bar, the writing surface (the engine runs on it), the floating
// bar, status bar and dialogs. Everything reads the instance; nothing is passed in but the instance.

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useEditorValue } from "./hooks";
import { SynTextEditor } from "./SynTextEditor";
import { FindBar, LinkDialog, MediaDetailsDialog, PreviewDialog, StatusBar } from "./UI/dialogs";
import { FloatBar } from "./UI/FloatBar";
import { ContextMenu } from "./UI/ContextMenu";
import "./contextMenu";
import { MediaGallery } from "./UI/media/MediaGallery";
import { ComponentsContext, cx, LayerContext, TooltipHost } from "./UI/primitives";
import { Toolbar } from "./UI/toolbar/Toolbar";
import { PRESETS } from "./presets";

const NO_COMPONENTS = {};
const len = (v: number | string | undefined) => (typeof v === "number" ? `${v}px` : v);

export function EditorView({ editor, className, style }: { editor: SynTextEditor; className?: string; style?: CSSProperties }) {
  const c = editor.config;
  const surface = useRef<HTMLDivElement>(null);
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const [surfaceEl, setSurfaceEl] = useState<HTMLDivElement | null>(null);
  const ui = useEditorValue(editor, ["ui"], (e) => e.getUI());
  const readOnly = useEditorValue(editor, ["ui"], (e) => e.isReadOnly());

  useEffect(() => {
    if (!surface.current) return;
    setSurfaceEl(surface.current);
    return editor.attach(surface.current);
  }, [editor]);

  // Leaving full screen with Escape.
  useEffect(() => {
    if (!ui.fullscreen) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && !ui.modal) editor.toggleFullscreen(false); };
    document.addEventListener("keydown", key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", key); document.body.style.overflow = overflow; };
  }, [editor, ui.fullscreen, ui.modal]);

  const statusbar = c.statusbar ?? PRESETS[c.preset ?? "full"].statusbar;
  const rootRef = useRef<HTMLDivElement>(null);
  const layer = { className: cx(editor.themeClass, c.classNames?.layer), style: { ...editor.varStyle, ...c.styles?.layer }, anchor: rootRef };
  const modal = ui.modal;

  return (
    <ComponentsContext.Provider value={c.components ?? NO_COMPONENTS}>
    <LayerContext.Provider value={layer}>
      <TooltipHost>
        {() => (
          <div
            ref={rootRef}
            className={cx("se-root", editor.themeClass, c.classNames?.root, className)}
            style={{ ...editor.varStyle, ...c.styles?.root, ...style }}
            data-variant={c.variant ?? "default"}
            data-fullscreen={ui.fullscreen ? "" : undefined}
            data-disabled={readOnly ? "" : undefined}
            onKeyDown={(e) => {
              const mod = e.ctrlKey || e.metaKey;
              if (!mod || e.altKey) return;
              if (e.code === "KeyK" && !e.shiftKey && editor.schema.has("link") && !readOnly && surface.current?.contains(e.target as Node)) { e.preventDefault(); editor.openLink(); }
              if (e.code === "KeyF" && !e.shiftKey) { e.preventDefault(); editor.toggleFind(true); }
            }}
            onKeyDownCapture={(e) => {
              // The keyboard's Menu key, or Shift+F10: the context menu at the caret.
              if ((e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) && surface.current?.contains(e.target as Node)) {
                if (editor.openContextMenu()) e.preventDefault();
              }
            }}
          >
            {editor.toolbar && (
              <Toolbar editor={editor} layout={editor.toolbar} className={c.classNames?.toolbar} style={c.styles?.toolbar}
                sticky={c.stickyToolbar} wrap={c.toolbarWrap} />
            )}
            {ui.find && <FindBar editor={editor} />}
            <div ref={setScroller} className="se-scroll" style={{ minHeight: len(c.minHeight) ?? (c.variant === "document" ? undefined : "8rem"), maxHeight: ui.fullscreen ? undefined : len(c.maxHeight) }}>
              <div
                ref={surface}
                id={c.id}
                role="textbox"
                aria-multiline="true"
                aria-label={c.ariaLabel ?? "Rich text editor"}
                aria-readonly={readOnly || undefined}
                spellCheck={c.spellCheck ?? true}
                data-placeholder={c.placeholder ?? ""}
                suppressContentEditableWarning
                className={cx("se-surface se-content", c.classNames?.surface, c.classNames?.content)}
                style={{ ...c.styles?.surface, ...c.styles?.content }}
                onContextMenu={(e) => {
                  const cfg = c.contextMenu;
                  if (cfg === false) return;
                  if (e.shiftKey && (typeof cfg !== "object" || cfg.nativeWithShift !== false)) return;   // the browser's own
                  if (e.nativeEvent.button === 0 && e.nativeEvent.detail === 0 && e.clientX === 0 && e.clientY === 0) {
                    if (editor.openContextMenu()) e.preventDefault();                                     // from the keyboard
                    return;
                  }
                  if (editor.openContextMenu(e.clientX, e.clientY, e.target as Element)) e.preventDefault();
                }}
              />
              <FloatBar editor={editor} surface={surfaceEl} scroller={scroller} />
            </div>
            {statusbar && <StatusBar editor={editor} className={c.classNames?.statusbar} style={c.styles?.statusbar} />}
            {modal?.kind === "gallery" && <MediaGallery editor={editor} filter={modal.filter} replace={modal.replace} thumbnailFor={modal.thumbnailFor} onClose={() => editor.closeModal()} />}
            {modal?.kind === "link" && <LinkDialog editor={editor} onClose={() => editor.closeModal()} />}
            {modal?.kind === "media" && <MediaDetailsDialog editor={editor} index={modal.index} onClose={() => editor.closeModal()} />}
            {modal?.kind === "preview" && <PreviewDialog editor={editor} onClose={() => editor.closeModal()} />}
            <ContextMenu editor={editor} />
          </div>
        )}
      </TooltipHost>
    </LayerContext.Provider>
    </ComponentsContext.Provider>
  );
}

SynTextEditor.View = EditorView;

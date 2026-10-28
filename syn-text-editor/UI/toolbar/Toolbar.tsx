"use client";
// ─── The toolbar ──────────────────────────────────────────────────────────────
// Lays out groups of tools by id, leaving out any whose format the editor's schema doesn't allow (a "basic"
// editor given the full layout still shows only bold, italic, lists and links).

import { Fragment, type CSSProperties } from "react";
import type { Format } from "../../core/model";
import { TOOL_FORMAT, type ToolbarLayout, type ToolId } from "../../presets";
import type { SynTextEditor } from "../../SynTextEditor";
import { cx } from "../primitives";
import { Tool } from "./tools";

/** Whether the editor allows what a tool makes. */
export function toolAllowed(editor: SynTextEditor, id: ToolId): boolean {
  const need = TOOL_FORMAT[id];
  if (!need) return true;
  return (Array.isArray(need) ? need : [need]).some((f: Format) => editor.schema.has(f));
}

export function Toolbar({ editor, layout, className, style, sticky, wrap }: {
  editor: SynTextEditor;
  layout: ToolbarLayout;
  className?: string;
  style?: CSSProperties;
  sticky?: boolean;
  wrap?: "wrap" | "scroll";
}) {
  const groups = layout.map((g) => g.filter((id) => toolAllowed(editor, id))).filter((g) => g.length);
  return (
    <div role="toolbar" aria-label="Formatting" className={cx("se-toolbar", className)} style={style}
      data-sticky={sticky ? "" : undefined} data-wrap={wrap ?? "wrap"}>
      {groups.map((g, i) => (
        <div key={i} className="se-tb-group">
          {g.map((id) => <Fragment key={id}><Tool editor={editor} id={id} /></Fragment>)}
        </div>
      ))}
    </div>
  );
}

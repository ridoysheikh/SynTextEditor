"use client";
// ─── The toolbar ──────────────────────────────────────────────────────────────
// Lays out groups of tools by id, leaving out any whose format the editor's schema doesn't allow (a "basic"
// editor given the full layout still shows only bold, italic, lists and links).

import { Fragment, type CSSProperties } from "react";
import type { Format } from "../../core/model";
import { TOOL_FORMAT, type ToolbarLayout, type ToolId } from "../../presets";
import type { SynTextEditor } from "../../SynTextEditor";
import { cx, overridable } from "../primitives";
import { Tool } from "./tools";

/** Whether the editor allows what a tool makes. */
export function toolAllowed(editor: SynTextEditor, id: ToolId | (string & {})): boolean {
  const need = TOOL_FORMAT[id as ToolId];
  if (!need) return true;
  return (Array.isArray(need) ? need : [need]).some((f: Format) => editor.schema.has(f));
}

function ToolbarBase({ editor, layout, className, style, sticky, wrap }: {
  editor: SynTextEditor;
  layout: ToolbarLayout;
  className?: string;
  style?: CSSProperties;
  sticky?: boolean;
  wrap?: "wrap" | "scroll";
}) {
  const groups = layout.map((g) => g.filter((id) => toolAllowed(editor, id))).filter((g) => g.length);
  // A lone "spacer" group splits the bar: what follows is one block pinned to the right, which stays on the
  // right when the bar wraps onto a second row.
  const split = groups.findIndex((g) => g.length === 1 && g[0] === "spacer");
  const main = split < 0 ? groups : groups.slice(0, split);
  const end = split < 0 ? [] : groups.slice(split + 1);
  const draw = (gs: string[][]) => gs.map((g, i) => (
    <div key={i} className="se-tb-group">
      {g.map((id) => <Fragment key={id}><Tool editor={editor} id={id} /></Fragment>)}
    </div>
  ));
  return (
    <div role="toolbar" aria-label="Formatting" className={cx("se-toolbar", className)} style={style}
      data-sticky={sticky ? "" : undefined} data-wrap={wrap ?? "wrap"}>
      {draw(main)}
      {end.length > 0 && <div className="se-tb-end">{draw(end)}</div>}
    </div>
  );
}
export const Toolbar = overridable("Toolbar", ToolbarBase);

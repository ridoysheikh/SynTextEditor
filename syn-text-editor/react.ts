"use client";
// ─── React bindings ──────────────────────────────────────────────────────────
// Two small hooks. Everything else is reached through the instance, so there is no provider, no context and no
// prop drilling:
//
//   const editor = useSynTextEditor({ preset: "basic", placeholder: "Say something…", onChange: save })
//   return <form>{editor.render()}<button onClick={() => post(editor.getValue())}>Send</button></form>

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { RichDoc } from "./core/model";
import { LIVE_OPTIONS, SynTextEditor, type LiveOptions, type SynTextEditorConfig } from "./SynTextEditor";
import "./render";

export { useEditorValue } from "./hooks";

/**
 * Create an editor tied to this component's lifetime.
 *
 * Returns a STABLE object: it never changes identity, so it is safe in dependency arrays and can be passed
 * through props or closures.
 *
 * Options stay controlled: change a prop and the editor follows — `value` (a value different from the one the
 * editor last reported replaces the content), `readOnly`, the callbacks, and every option in `LIVE_OPTIONS`
 * (look, toolbar, formats, storage, context menu…). Plain-data options are compared by value, so inline objects
 * don't cause work on every render.
 */
export function useSynTextEditor(config: SynTextEditorConfig = {}): SynTextEditor {
  const [editor] = useState(() => new SynTextEditor(config));
  editor.updateCallbacks(config);
  // Options holding functions are read when used — hand over the latest each render, without a redraw.
  editor.setOptions({ contextMenu: config.contextMenu, storage: config.storage, upload: config.upload }, { silent: true });

  const seen = useRef<string | null>(null);
  const data: Record<string, unknown> = {};
  for (const k of LIVE_OPTIONS) if (k !== "contextMenu" && k !== "storage" && k !== "upload") data[k] = config[k];
  const key = JSON.stringify(data);
  useEffect(() => {
    if (seen.current === null) { seen.current = key; return; }            // the constructor already has them
    if (seen.current === key) return;
    seen.current = key;
    editor.setOptions(data as LiveOptions);
  });

  useEffect(() => {
    if (config.readOnly !== undefined && config.readOnly !== editor.isReadOnly()) editor.setReadOnly(config.readOnly);
  }, [editor, config.readOnly]);

  const hasValue = "value" in config;
  useEffect(() => {
    if (hasValue) editor.syncValue(config.value);
  }, [editor, hasValue, config.value]);

  return editor;
}

/** The editor as a component, for when the instance isn't needed: `<SynEditor preset="basic" onChange={…} />`. */
export function SynEditor(props: SynTextEditorConfig & { className?: string; style?: CSSProperties }) {
  const { className, style, ...config } = props;
  const editor = useSynTextEditor(config);
  return editor.render({ className, style });
}

export type { RichDoc };

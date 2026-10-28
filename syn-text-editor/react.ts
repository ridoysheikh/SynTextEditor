"use client";
// ─── React bindings ──────────────────────────────────────────────────────────
// Two small hooks. Everything else is reached through the instance, so there is no provider, no context and no
// prop drilling:
//
//   const editor = useSynTextEditor({ preset: "basic", placeholder: "Say something…", onChange: save })
//   return <form>{editor.render()}<button onClick={() => post(editor.getValue())}>Send</button></form>

import { useEffect, useState, type CSSProperties } from "react";
import type { RichDoc } from "./core/model";
import { SynTextEditor, type SynTextEditorConfig } from "./SynTextEditor";
import "./render";

export { useEditorValue } from "./hooks";

/**
 * Create an editor tied to this component's lifetime.
 *
 * Returns a STABLE object: it never changes identity, so it is safe in dependency arrays and can be passed
 * through props or closures. `config` is read once — except the callbacks (always the latest), `readOnly`, and
 * `value`: passing a different `value` than the editor last reported replaces the content, so the editor works
 * controlled (`value` + `onChange`) or uncontrolled (read it with `editor.getValue()`).
 */
export function useSynTextEditor(config: SynTextEditorConfig = {}): SynTextEditor {
  const [editor] = useState(() => new SynTextEditor(config));
  editor.updateCallbacks(config);

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

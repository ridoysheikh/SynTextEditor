"use client";
// The subscription hook every tool reads the editor through. Kept apart from react.ts so the UI can import it
// without importing the component tree back.

import { useCallback, useRef, useSyncExternalStore } from "react";
import type { EventName, SynTextEditor } from "./SynTextEditor";

/** Shallow equality, so a rebuilt array or object is not treated as a change. */
function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  return true;
}

/**
 * Subscribe a component to editor events and render what `select` reads. The component updates only when the
 * selected value changes (shallowly), so `useEditorValue(editor, ["change"], (e) => e.getWords())` re-renders on
 * a word count change, not on every keystroke.
 *
 * `select` is held in a ref (an inline arrow changes identity every render; depending on it would loop
 * `useSyncExternalStore`), and its result is cached shallowly (getters build fresh objects).
 */
export function useEditorValue<T>(editor: SynTextEditor, events: EventName[], select: (editor: SynTextEditor) => T): T {
  const key = events.join(",");
  const selectRef = useRef(select);
  selectRef.current = select;
  const subscribe = useCallback((onChange: () => void) => {
    const offs = key.split(",").map((e) => editor.on(e as "state", onChange));
    return () => { for (const off of offs) off(); };
  }, [editor, key]);
  const cache = useRef<{ value: T } | null>(null);
  const getSnapshot = useCallback(() => {
    const next = selectRef.current(editor);
    const prev = cache.current;
    if (prev !== null && shallowEqual(prev.value, next)) return prev.value;
    cache.current = { value: next };
    return next;
  }, [editor]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

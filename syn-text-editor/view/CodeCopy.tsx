"use client";
// ─── <CodeCopy> ───────────────────────────────────────────────────────────────
// The Copy button of a code block in the viewer. Its own client module, so the viewer stays a Server Component:
// on the server it draws the button, and it copies once it hydrates.

import { useEffect, useState } from "react";
import { copyText } from "./copy";
import { COPY_ICON, COPIED_ICON } from "./code-mount";

export function CodeCopy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1500);
    return () => clearTimeout(t);
  }, [done]);
  return (
    <button type="button" className="se-code-copy" aria-label={done ? "Copied" : "Copy code"} title={done ? "Copied" : "Copy code"}
      data-done={done ? "" : undefined}
      onClick={() => { void copyText(text).then((ok) => setDone(ok)); }}
      dangerouslySetInnerHTML={{ __html: done ? COPIED_ICON : COPY_ICON }} />
  );
}

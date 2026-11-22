/**
 * Copy plain text to the clipboard: the async Clipboard API, else a hidden textarea and `execCommand("copy")` (pages
 * served over plain http, older browsers). Resolves whether it worked.
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof document === "undefined") return false;
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext !== false) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall back */ }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none";
  // Inside a host's dialog, focus may only move within it — so the textarea goes where focus is.
  (document.activeElement?.closest("dialog, [role='dialog'], [aria-modal='true']") ?? document.body).appendChild(area);
  const prev = document.activeElement as HTMLElement | null;
  area.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { ok = false; }
  area.remove();
  prev?.focus?.({ preventScroll: true });
  return ok;
}

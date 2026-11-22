/**
 * Code blocks in stored HTML: `toHTML` writes them with their header, lines and colours (all CSS), and this adds
 * the Copy button — the one part that needs script. Call it once the HTML is on the page, like `mountPlayers`.
 *
 *   useEffect(() => mountCode(ref.current!), [html]);
 */
import { copyText } from "./copy";

const svg = (paths: string) =>
  `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
export const COPY_ICON = svg('<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>');
export const COPIED_ICON = svg('<path d="M20 6 9 17l-5-5"/>');

/** The text of a drawn code block (its lines), without the button or anything else added around it. */
export function codeTextOf(pre: Element): string {
  const body = pre.querySelector(".se-code-body") ?? pre;
  const lines = body.querySelectorAll(".se-ln");
  if (!lines.length) return (body as HTMLElement).innerText ?? body.textContent ?? "";
  return Array.from(lines).map((l) => (l.textContent ?? "").replace(/\n$/, "")).join("\n");
}

/** Add a Copy button to every code block (`.se-code`) under `scope`. Returns a function that takes them away. */
export function mountCode(scope: ParentNode = document): () => void {
  const added: HTMLButtonElement[] = [];
  for (const pre of Array.from(scope.querySelectorAll<HTMLElement>(".se-code"))) {
    if (pre.closest(".se-surface") || pre.querySelector(":scope > .se-code-copy")) continue;   // the editor has its own
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "se-code-copy";
    btn.setAttribute("aria-label", "Copy code");
    btn.title = "Copy code";
    btn.innerHTML = COPY_ICON;
    let timer: ReturnType<typeof setTimeout> | undefined;
    btn.addEventListener("click", () => {
      void copyText(codeTextOf(pre)).then((ok) => {
        if (!ok) return;
        btn.innerHTML = COPIED_ICON;
        btn.setAttribute("data-done", "");
        btn.setAttribute("aria-label", "Copied");
        clearTimeout(timer);
        timer = setTimeout(() => { btn.innerHTML = COPY_ICON; btn.removeAttribute("data-done"); btn.setAttribute("aria-label", "Copy code"); }, 1500);
      });
    });
    pre.append(btn);
    added.push(btn);
  }
  return () => added.forEach((b) => b.remove());
}

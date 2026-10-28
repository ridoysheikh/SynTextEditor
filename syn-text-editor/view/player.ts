// ─── The video player ─────────────────────────────────────────────────────────
// A small player drawn by the library instead of the browser's controls: a play button over the thumbnail, then
// a slim bar — play, time, seek (with buffered range and a hover time), volume, speed, full screen — that fades
// while the video plays. Plain DOM, no React: the editor's surface, the viewer's <VideoPlayer> and static HTML
// from `toHTML` (via `mountPlayers`) all use it. Styled by `.se-player*` classes and `--se-player-*` variables.
//
// Markup it takes:  <div class="se-player"><video src="…" poster="…"></video></div>
//
// Keys (when the player has focus): Space / K play-pause · ← → 5 s · J / L 10 s · ↑ ↓ volume · M mute ·
// F full screen · Home / End · 0–9 jump to 0–90 %.

export interface PlayerOptions {
  /** A click on the picture plays / pauses (default true). The editor turns it off: there a click selects. */
  clickToPlay?: boolean;
  /** Accessible name for the player (default "Video"). */
  label?: string;
}

const svg = (body: string, fill = false) =>
  `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" ${fill ? 'fill="currentColor" stroke="none"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'}>${body}</svg>`;
const SPEAKER = '<path d="M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z"/>';
export const PLAYER_ICONS = {
  play: svg('<path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/>', true),
  pause: svg('<rect x="6" y="4" width="4" height="16" rx="1.2"/><rect x="14" y="4" width="4" height="16" rx="1.2"/>', true),
  replay: svg('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>'),
  volume: svg(`${SPEAKER}<path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.4 18.4a9 9 0 0 0 0-12.8"/>`),
  low: svg(`${SPEAKER}<path d="M16 9a5 5 0 0 1 0 6"/>`),
  muted: svg(`${SPEAKER}<line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/>`),
  full: svg('<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>'),
  exit: svg('<path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>'),
};
const RATES = [1, 1.25, 1.5, 2, 0.5, 0.75];
const IDLE_MS = 2200;

/** 75 → "1:15", 3725 → "1:02:05". */
export function formatTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, attrs: Record<string, string> = {}, html = "") => {
  const e = document.createElement(tag);
  e.className = cls;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (html) e.innerHTML = html;
  return e;
};
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Draws the player into `root` (which holds a <video>). Returns a function that takes it out again. */
export function mountPlayer(root: HTMLElement, opts: PlayerOptions = {}): () => void {
  const video = root.querySelector("video");
  if (!video || root.dataset.seMounted !== undefined) return () => {};
  const clickToPlay = opts.clickToPlay ?? true;
  const offs: (() => void)[] = [];
  const on = <E extends Event>(t: EventTarget, type: string, fn: (e: E) => void, o?: AddEventListenerOptions) => {
    t.addEventListener(type, fn as EventListener, o);
    offs.push(() => t.removeEventListener(type, fn as EventListener, o));
  };

  root.dataset.seMounted = "";
  root.classList.add("se-player");
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", opts.label ?? "Video");
  root.tabIndex = 0;
  const hadControls = video.controls;
  video.controls = false;
  video.playsInline = true;
  if (!video.preload || video.preload === "auto") video.preload = "metadata";

  // ── parts ──
  const big = el("button", "se-pl-big", { type: "button", "aria-label": "Play" }, PLAYER_ICONS.play);
  const spin = el("div", "se-pl-spin", { "aria-hidden": "true" });
  const msg = el("div", "se-pl-msg", { role: "status" });
  msg.hidden = true;
  const bar = el("div", "se-pl-bar");
  const play = el("button", "se-pl-btn", { type: "button", "aria-label": "Play" }, PLAYER_ICONS.play);
  const now = el("span", "se-pl-time", { "aria-hidden": "true" }, "0:00");
  const seek = el("div", "se-pl-seek", { role: "slider", tabindex: "0", "aria-label": "Seek", "aria-valuemin": "0", "aria-valuemax": "0", "aria-valuenow": "0" });
  const track = el("div", "se-pl-track");
  const buf = el("div", "se-pl-buf");
  const fill = el("div", "se-pl-fill");
  const knob = el("div", "se-pl-knob");
  const hover = el("div", "se-pl-hover", { "aria-hidden": "true" });
  track.append(buf, fill);
  seek.append(track, knob, hover);
  const total = el("span", "se-pl-time se-pl-total", { "aria-hidden": "true" }, "0:00");
  const vol = el("div", "se-pl-vol");
  const mute = el("button", "se-pl-btn", { type: "button", "aria-label": "Mute" }, PLAYER_ICONS.volume);
  const volbar = el("div", "se-pl-volbar", { role: "slider", tabindex: "0", "aria-label": "Volume", "aria-valuemin": "0", "aria-valuemax": "100" });
  const volfill = el("div", "se-pl-volfill");
  volbar.append(volfill);
  vol.append(mute, volbar);
  const rate = el("button", "se-pl-btn se-pl-rate", { type: "button", "aria-label": "Playback speed" }, "1×");
  const fs = el("button", "se-pl-btn", { type: "button", "aria-label": "Full screen" }, PLAYER_ICONS.full);
  bar.append(play, now, seek, total, vol, rate, fs);
  const parts = [big, spin, msg, bar];
  root.append(...parts);

  // ── state → view ──
  let started = false;
  let idle: ReturnType<typeof setTimeout> | undefined;
  const dur = () => (Number.isFinite(video.duration) ? video.duration : 0);
  const state = () => (video.ended ? "ended" : video.paused ? (started ? "paused" : "idle") : "playing");
  const paint = () => {
    const st = state();
    root.dataset.state = st;
    const label = st === "playing" ? "Pause" : st === "ended" ? "Replay" : "Play";
    play.innerHTML = st === "playing" ? PLAYER_ICONS.pause : st === "ended" ? PLAYER_ICONS.replay : PLAYER_ICONS.play;
    play.setAttribute("aria-label", label);
    big.innerHTML = st === "ended" ? PLAYER_ICONS.replay : PLAYER_ICONS.play;
    big.setAttribute("aria-label", label);
  };
  const paintTime = () => {
    const d = dur(), t = video.currentTime;
    const pct = d ? (t / d) * 100 : 0;
    fill.style.width = knob.style.left = `${pct}%`;
    now.textContent = formatTime(t);
    total.textContent = formatTime(d);
    seek.setAttribute("aria-valuemax", String(Math.round(d)));
    seek.setAttribute("aria-valuenow", String(Math.round(t)));
    seek.setAttribute("aria-valuetext", `${formatTime(t)} of ${formatTime(d)}`);
    const b = video.buffered;
    buf.style.width = d && b.length ? `${(b.end(b.length - 1) / d) * 100}%` : "0";
  };
  const paintVolume = () => {
    const v = video.muted ? 0 : video.volume;
    volfill.style.width = `${v * 100}%`;
    volbar.setAttribute("aria-valuenow", String(Math.round(v * 100)));
    mute.innerHTML = v === 0 ? PLAYER_ICONS.muted : v < 0.5 ? PLAYER_ICONS.low : PLAYER_ICONS.volume;
    mute.setAttribute("aria-label", video.muted ? "Unmute" : "Mute");
  };
  const show = () => {
    root.dataset.ui = "shown";
    clearTimeout(idle);
    if (!video.paused) idle = setTimeout(() => { if (!video.paused && !bar.matches(":hover, :focus-within")) root.dataset.ui = "hidden"; }, IDLE_MS);
  };

  // ── actions ──
  const toggle = () => {
    if (video.paused || video.ended) {
      started = true;
      const p = video.play();
      p?.catch((err: Error) => { if (err.name !== "AbortError") fail(); });
    } else video.pause();
  };
  const jump = (t: number) => { started = true; video.currentTime = clamp(t, 0, dur() || 0); paintTime(); };
  const setVolume = (v: number) => { video.volume = clamp(v, 0, 1); video.muted = video.volume === 0; };
  const fail = () => {
    msg.textContent = "Can't play this video";
    msg.hidden = false;
    root.dataset.error = "";
  };
  const fullscreen = () => {
    const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
    if (document.fullscreenElement === root || doc.webkitFullscreenElement === root) {
      (document.exitFullscreen ?? doc.webkitExitFullscreen)?.call(document);
      return;
    }
    const r = root as HTMLElement & { webkitRequestFullscreen?: () => void };
    if (r.requestFullscreen) void r.requestFullscreen().catch(() => {});
    else if (r.webkitRequestFullscreen) r.webkitRequestFullscreen();
    else (video as HTMLVideoElement & { webkitEnterFullscreen?: () => void }).webkitEnterFullscreen?.();   // iOS
  };

  // ── wiring ──
  for (const ev of ["play", "pause", "ended", "playing"]) on(video, ev, () => { paint(); show(); });
  on(video, "timeupdate", () => {
    if (!root.isConnected) { video.pause(); return; }            // its block was redrawn or removed: stop the sound
    paintTime();
  });
  for (const ev of ["loadedmetadata", "durationchange", "progress", "seeked"]) on(video, ev, paintTime);
  on(video, "volumechange", paintVolume);
  on(video, "waiting", () => { root.dataset.loading = ""; });
  for (const ev of ["canplay", "playing", "pause"]) on(video, ev, () => { delete root.dataset.loading; });
  on(video, "error", fail);
  on(video, "ratechange", () => { rate.textContent = `${video.playbackRate}×`; });

  // The controls are their own: the editor (or a link around the player) never sees these events.
  const mine = (e: Event) => e.stopPropagation();
  for (const part of [big, bar]) for (const ev of ["mousedown", "pointerdown", "click", "dblclick", "keydown", "selectstart", "contextmenu"]) on(part, ev, mine);

  on(big, "click", toggle);
  on(play, "click", toggle);
  on(mute, "click", () => { video.muted = !video.muted; if (!video.muted && video.volume === 0) video.volume = 0.6; });
  on(rate, "click", () => { video.playbackRate = RATES[(RATES.indexOf(video.playbackRate) + 1) % RATES.length]; });
  on(fs, "click", fullscreen);
  on(root, "fullscreenchange", () => {
    const full = document.fullscreenElement === root;
    fs.innerHTML = full ? PLAYER_ICONS.exit : PLAYER_ICONS.full;
    fs.setAttribute("aria-label", full ? "Exit full screen" : "Full screen");
    root.toggleAttribute("data-fullscreen", full);
  });
  on(video, "click", (e: MouseEvent) => { if (clickToPlay) { e.preventDefault(); toggle(); } });
  on(video, "dblclick", () => { if (clickToPlay) fullscreen(); });
  on(root, "pointermove", show);
  on(root, "pointerleave", () => { if (!video.paused) root.dataset.ui = "hidden"; });
  on(root, "focusin", show);

  // A slider dragged with the pointer: seek and volume.
  const drag = (slider: HTMLElement, at: (ratio: number) => void) => {
    const ratio = (e: PointerEvent) => { const r = slider.getBoundingClientRect(); return clamp((e.clientX - r.left) / (r.width || 1), 0, 1); };
    on(slider, "pointerdown", (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      slider.setPointerCapture(e.pointerId);
      slider.dataset.drag = "";
      at(ratio(e));
    });
    on(slider, "pointermove", (e: PointerEvent) => { if (slider.hasPointerCapture(e.pointerId)) at(ratio(e)); });
    on(slider, "pointerup", () => { delete slider.dataset.drag; });
    on(slider, "lostpointercapture", () => { delete slider.dataset.drag; });
  };
  drag(seek, (r) => jump(r * dur()));
  drag(volbar, (r) => setVolume(r));
  on(seek, "pointermove", (e: PointerEvent) => {
    const r = seek.getBoundingClientRect();
    const x = clamp(e.clientX - r.left, 0, r.width);
    hover.textContent = formatTime((x / (r.width || 1)) * dur());
    hover.style.left = `${x}px`;
  });

  // Keys: on the player and everything in it (capture: the bar keeps its events to itself).
  on(root, "keydown", (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement;
    if (t.tagName === "BUTTON" && (e.key === " " || e.key === "Enter")) return;    // the focused button's own click
    const d = dur();
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const onVolume = t === volbar;
    let handled = true;
    if (k === " " || k === "k") toggle();
    else if (k === "ArrowLeft") onVolume ? setVolume(video.volume - 0.1) : jump(video.currentTime - 5);
    else if (k === "ArrowRight") onVolume ? setVolume(video.volume + 0.1) : jump(video.currentTime + 5);
    else if (k === "ArrowUp") setVolume(video.volume + 0.1);
    else if (k === "ArrowDown") setVolume(video.volume - 0.1);
    else if (k === "j") jump(video.currentTime - 10);
    else if (k === "l") jump(video.currentTime + 10);
    else if (k === "m") video.muted = !video.muted;
    else if (k === "f") fullscreen();
    else if (k === "Home") jump(0);
    else if (k === "End") jump(d);
    else if (/^[0-9]$/.test(k)) jump((Number(k) / 10) * d);
    else handled = false;
    if (handled) { e.preventDefault(); e.stopPropagation(); show(); }
  }, { capture: true });
  // Nothing typed in the player reaches the editor around it — but Tab and Escape still move on.
  on(root, "keydown", (e: KeyboardEvent) => { if (e.key !== "Tab" && e.key !== "Escape") e.stopPropagation(); });

  // Narrow players drop the volume and total time (CSS reads `data-compact`).
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => { root.toggleAttribute("data-compact", root.clientWidth < 420); });
    ro.observe(root);
    offs.push(() => ro.disconnect());
  }

  paint();
  paintTime();
  paintVolume();
  root.dataset.ui = "shown";

  return () => {
    clearTimeout(idle);
    offs.forEach((f) => f());
    parts.forEach((p) => p.remove());
    video.controls = hadControls;
    for (const k of ["seMounted", "state", "ui", "loading", "error"]) delete root.dataset[k];
    root.removeAttribute("data-compact");
  };
}

/**
 * Draw the player into every `.se-player` under `scope` that doesn't have it yet — for HTML from `toHTML` or your
 * own markup. Returns a function that takes them all out.
 */
export function mountPlayers(scope: ParentNode = document, opts?: PlayerOptions): () => void {
  const offs = Array.from(scope.querySelectorAll<HTMLElement>(".se-player")).map((p) => mountPlayer(p, opts));
  return () => offs.forEach((f) => f());
}

/**
 * The frame a video shows now, as an image — for a thumbnail. A video from another site can only be read if its
 * server allows it (CORS); then this rejects with a message that says so.
 */
export async function captureFrame(video: HTMLVideoElement, { type = "image/jpeg", quality = 0.85, maxWidth = 1280 } = {}): Promise<Blob> {
  const ready = (v: HTMLVideoElement) => new Promise<void>((res, rej) => {
    if (v.readyState >= 2) return res();
    const t = setTimeout(() => rej(new Error("The video didn't load")), 15000);
    v.addEventListener("loadeddata", () => { clearTimeout(t); res(); }, { once: true });
    v.addEventListener("error", () => { clearTimeout(t); rej(new Error("The video didn't load")); }, { once: true });
  });
  const draw = (v: HTMLVideoElement) => new Promise<Blob>((res, rej) => {
    const w = v.videoWidth, h = v.videoHeight;
    if (!w || !h) return rej(new Error("The video has no picture yet"));
    const scale = Math.min(1, maxWidth / w);
    const c = document.createElement("canvas");
    c.width = Math.round(w * scale);
    c.height = Math.round(h * scale);
    c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
    try { c.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't make an image"))), type, quality); } catch (e) { rej(e); }
  });
  await ready(video);
  try {
    return await draw(video);
  } catch (e) {
    if ((e as Error).name !== "SecurityError") throw e;
  }
  // Another site's video: try again asking for CORS — works when its server allows it.
  const copy = document.createElement("video");
  copy.crossOrigin = "anonymous";
  copy.muted = true;
  copy.preload = "auto";
  copy.src = video.currentSrc || video.src;
  try {
    await ready(copy);
    copy.currentTime = video.currentTime;
    await new Promise((r) => copy.addEventListener("seeked", r, { once: true }));
    return await draw(copy);
  } catch {
    throw new Error("This video's server doesn't allow taking a picture from it — upload an image instead");
  } finally {
    copy.removeAttribute("src");
    copy.load();
  }
}

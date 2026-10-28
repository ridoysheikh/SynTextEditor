"use client";
// ─── <VideoPlayer> ────────────────────────────────────────────────────────────
// The viewer's video: the library's player (./player) around a <video>. Its own client module, so the viewer —
// a Server Component — can render it: on the server it draws the thumbnail and a play button, and the controls
// arrive when it hydrates.

import { useEffect, useRef, type CSSProperties } from "react";
import { mountPlayer, PLAYER_ICONS } from "./player";

export interface VideoPlayerProps {
  src: string;
  /** The thumbnail shown before it plays. */
  poster?: string;
  /** Accessible name (the caption, when there is one). */
  label?: string;
  /** A click on the picture plays / pauses (default true). */
  clickToPlay?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function VideoPlayer({ src, poster, label, clickToPlay = true, className, style }: VideoPlayerProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => (ref.current ? mountPlayer(ref.current, { clickToPlay, label }) : undefined), [src, clickToPlay, label]);
  return (
    <div ref={ref} className={className ? `se-player ${className}` : "se-player"} style={style} data-state="idle">
      <video src={src} poster={poster} preload="metadata" playsInline />
      <span className="se-pl-big se-pl-ssr" aria-hidden dangerouslySetInnerHTML={{ __html: PLAYER_ICONS.play }} />
    </div>
  );
}

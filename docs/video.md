# Video: thumbnails and the player

Video blocks have a **thumbnail** (the picture shown before it plays) and a small **player** drawn by the library —
the same one in the writing area, the viewer and the details dialog. No browser video controls.

## Thumbnails

A thumbnail is the block's `poster`: an image address, stored in the document. Without one, the video shows its
first frame. Set it in the editor, from code, or in the stored document.

**In the editor** — select a video, then the **Thumbnail** button on the bar above it, or right-click ▸ **Thumbnail**,
or **Details** ▸ the Thumbnail section:

| | |
|---|---|
| Use current frame | pause the preview on the moment you want, then take that frame as the picture |
| Upload image | an image from your computer — through your [storage](storage.md), or embedded when there is none |
| Library… / From a link… | pick an image from your media library, or paste an address |
| Remove | back to the first frame |

The right-click row **Use current frame** takes the frame the video in the document shows now.

**From code:**

```ts
editor.insertVideo("https://cdn.example.com/intro.mp4", { poster: "https://cdn.example.com/intro.jpg" });
editor.setVideoThumbnail(index, "https://cdn.example.com/new.jpg");   // null removes it
await editor.captureThumbnail(index);                // the frame it shows now → upload → thumbnail; true when it worked
const url = await editor.uploadThumbnail(file);      // store an image, get its address (null if refused)
editor.openThumbnailLibrary(index);                  // the library, to pick an image
```

**In the document:** `{ type: "video", src, poster?: "https://…" }`. `poster` must be an address that `safeSrc`
allows (`https:`, a path, `blob:`) — inline `data:` is accepted only as `data:image/…`. Anything else is dropped by
`toDoc`. It's exported to HTML as the `<video poster>` attribute and read back from it.

**An asset's own thumbnail:** when you insert a video from your library whose [`Asset`](storage.md) has a `thumbnail`,
the block starts with it.

**Taking a frame from a video on another site** works only if that server sends CORS headers
(`Access-Control-Allow-Origin`). Otherwise the editor reports why through `onError` and suggests uploading an image.
Uploads need an image; anything else is refused.

## The player

A play button over the thumbnail, then one slim bar: play · time · seek (with a buffered range and the time under
the pointer) · total · volume · speed · full screen. The bar fades away while the video plays and returns when the
pointer moves. Narrow players (under 420px) drop the volume and total time; touch screens get larger buttons.

In the writing area a click on the picture **selects the block** (so you can resize, align or move it); the controls
play it. Everything the player handles stays in the player — typing or clicking in it never changes the document.
A read-only editor plays too.

### Keyboard

With the player focused (Tab to it):

| Keys | |
|---|---|
| Space · K | play / pause |
| ← → | back / forward 5 s (on the volume slider: volume) |
| J · L | back / forward 10 s |
| ↑ ↓ | volume |
| M | mute |
| F | full screen |
| Home · End | start · end |
| 0–9 | jump to 0%–90% |

### Making it yours

Colours and size are variables (on `.se-root`, `.se-layer`, `.se-content` — set them in CSS or with `vars`):

| Variable | Default | |
|---|---|---|
| `--se-player-bar-h` | `30px` | height of the control bar |
| `--se-player-radius` | `var(--se-radius-sm)` | corner radius |
| `--se-player-bg` | `#0b0d12` | behind the picture |
| `--se-player-fg` | `#fff` | controls and the play button |
| `--se-player-accent` | `var(--se-accent)` | progress, focus ring, play button hover |

```tsx
<SynEditor vars={{ "--se-player-accent": "#e11d48", "--se-player-bar-h": "36px" }} />
```

Classes: `.se-player` (`[data-state="idle|playing|paused|ended"]`, `[data-ui="hidden"]`, `[data-compact]`,
`[data-fullscreen]`, `[data-error]`), `.se-pl-big`, `.se-pl-bar`, `.se-pl-btn`, `.se-pl-time`, `.se-pl-seek`
(`.se-pl-track`, `.se-pl-buf`, `.se-pl-fill`, `.se-pl-knob`, `.se-pl-hover`), `.se-pl-vol`, `.se-pl-rate`.

**Your own player.** `components.VideoPlayer` replaces the player of the viewer and of the details dialog, and gets
`Default`; in the viewer it's also a prop:

```tsx
import { SynTextView, type VideoPlayerProps } from "@syntext/react/view";

const Player = ({ src, poster, label, Default }: VideoPlayerProps & { Default: ComponentType<VideoPlayerProps> }) => (
  <MyPlayer url={src} cover={poster} title={label} />
);
<SynTextView value={doc} components={{ VideoPlayer: Player }} />
```

The writing area's player is plain DOM (the editor draws blocks without React), so there it's styled with the
variables and classes above, not replaced.

### Next.js and servers

`SynTextView` stays server-safe: on the server a video renders as its thumbnail with a play button, and the player's
controls arrive when it hydrates. `VideoPlayer` is its own client chunk (`"use client"`), so a Server Component
importing `@syntext/react/view` gets it as a client component — no error about hooks. Before the script loads, the
picture shows without controls.

### For HTML from `toHTML`

`toHTML(doc)` writes class-mode videos as `<div class="se-player"><video poster controls>…</video></div>` — the
browser's own controls until you draw the library's:

```ts
import { mountPlayers } from "@syntext/react";
const off = mountPlayers(container);         // every .se-player under it gets the player; off() removes them
```

`mountPlayer(el, { clickToPlay?, label? })` does one. `captureFrame(video)` returns a frame as a `Blob`;
`formatTime(seconds)` gives `"1:15"`. Inline-mode HTML (`{ mode: "inline" }`, for email) keeps a plain
`<video poster controls>` — the player is a script.

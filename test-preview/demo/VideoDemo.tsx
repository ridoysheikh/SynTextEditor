// ─── Video demo ───────────────────────────────────────────────────────────────
// A video with a custom thumbnail, one without (shows its first frame), the editor beside the viewer.

import { useEffect, useMemo, useState } from 'react'
import { useSynTextEditor } from '@syn/react'
import { createMemoryStorage } from '@syn/core/storage'
import type { RichDoc } from '@syn/core/model'
import { SynTextView } from '@syn/view/SynTextView'
import { SEED } from '@test-preview/demo/sample'

const FLOWER = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm'

const VIDEO_DOC: RichDoc = {
  version: 1,
  blocks: [
    { type: 'h2', spans: [{ text: 'Video with a thumbnail' }] },
    { type: 'p', spans: [{ text: 'Click a video, then use the toolbar above it (or right-click) to change its thumbnail.' }] },
    { type: 'video', src: FLOWER, poster: 'https://picsum.photos/id/1043/1200/700', caption: 'A custom thumbnail', width: 70, spans: [] },
    { type: 'p', spans: [{ text: 'Without one, the first frame shows:' }] },
    { type: 'video', src: FLOWER, caption: 'No thumbnail', width: 50, spans: [] },
  ],
}

export function VideoDemo () {
  const storage = useMemo(() => createMemoryStorage({ latency: 300, seed: SEED }), [])
  const [doc, setDoc] = useState<RichDoc | null>(VIDEO_DOC)
  const editor = useSynTextEditor({ preset: 'full', value: VIDEO_DOC, storage, maxHeight: 560, onChange: setDoc })
  useEffect(() => { (window as unknown as { __editor: unknown }).__editor = editor }, [editor])
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div>{editor.render()}</div>
      <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-2 text-xs font-medium text-zinc-500">Viewer (what readers see)</div>
        <SynTextView value={doc} />
      </div>
    </div>
  )
}

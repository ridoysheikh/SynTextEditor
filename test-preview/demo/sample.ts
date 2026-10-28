import type { Asset } from '@syn/core/storage'
import type { RichDoc } from '@syn/core/model'

/** A few remote pictures so the gallery isn't empty on first open. */
export const SEED: Asset[] = [
  { id: 'p1', url: 'https://picsum.photos/id/1015/1200/800', thumbnail: 'https://picsum.photos/id/1015/300/200', name: 'river-valley.jpg', type: 'image/jpeg', size: 284_112, width: 1200, height: 800, createdAt: '2026-09-02T10:00:00Z' },
  { id: 'p2', url: 'https://picsum.photos/id/1025/1200/900', thumbnail: 'https://picsum.photos/id/1025/300/225', name: 'pug.jpg', type: 'image/jpeg', size: 198_400, width: 1200, height: 900, createdAt: '2026-09-04T10:00:00Z' },
  { id: 'p3', url: 'https://picsum.photos/id/1043/1200/800', thumbnail: 'https://picsum.photos/id/1043/300/200', name: 'forest-road.jpg', type: 'image/jpeg', size: 311_870, width: 1200, height: 800, createdAt: '2026-09-11T10:00:00Z' },
  { id: 'p4', url: 'https://picsum.photos/id/1067/1200/800', thumbnail: 'https://picsum.photos/id/1067/300/200', name: 'city-night.jpg', type: 'image/jpeg', size: 402_004, width: 1200, height: 800, createdAt: '2026-09-15T10:00:00Z' },
  { id: 'p5', url: 'https://picsum.photos/id/292/1200/800', thumbnail: 'https://picsum.photos/id/292/300/200', name: 'kitchen.jpg', type: 'image/jpeg', size: 230_550, width: 1200, height: 800, createdAt: '2026-09-20T10:00:00Z' },
  { id: 'f1', url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', name: 'quarterly-report.pdf', type: 'application/pdf', size: 13_264, createdAt: '2026-09-21T10:00:00Z' },
]

export const WORD_DOC: RichDoc = {
  version: 1,
  blocks: [
    { type: 'h1', spans: [{ text: 'Quarterly field notes' }] },
    { type: 'p', spans: [
      { text: 'A ' }, { text: 'model-first', bold: true }, { text: ' editor: the document is data, not HTML. Try ' },
      { text: 'colours', color: 'blue' }, { text: ', ' }, { text: 'highlights', highlight: 'yellow' }, { text: ', ' },
      { text: 'Georgia', font: "Georgia, 'Times New Roman', serif", size: 18 }, { text: ', ' }, { text: 'inline code', code: true },
      { text: ', H' }, { text: '2', script: 'sub' }, { text: 'O and ' }, { text: 'links', link: 'https://example.com' }, { text: '.' },
    ] },
    { type: 'h2', spans: [{ text: 'This week' }] },
    { type: 'p', list: 'check', checked: true, spans: [{ text: 'Ship the media gallery' }] },
    { type: 'p', list: 'check', spans: [{ text: 'Tables with Tab between cells' }] },
    { type: 'p', list: 'ordered', spans: [{ text: 'Numbered lists' }] },
    { type: 'p', list: 'ordered', indent: 1, spans: [{ text: 'nest with Tab' }] },
    { type: 'p', list: 'ordered', indent: 2, spans: [{ text: 'and again' }] },
    { type: 'p', list: 'ordered', spans: [{ text: 'Shift+Tab steps back out' }] },
    { type: 'quote', spans: [{ text: 'Type "# " for a heading, "- " for a list, "[] " for a checklist, "> " for a quote, "```" + space for code.' }] },
    { type: 'image', src: 'https://picsum.photos/id/1015/1200/800', alt: 'River valley', caption: 'Click an image: resize from its corner, align, caption or replace it.', width: 70, asset: 'p1', spans: [] },
    { type: 'h3', spans: [{ text: 'Numbers' }] },
    { type: 'table', head: true, spans: [], rows: [
      [{ spans: [{ text: 'Region' }] }, { spans: [{ text: 'Q2' }], align: 'right' }, { spans: [{ text: 'Q3' }], align: 'right' }],
      [{ spans: [{ text: 'North' }] }, { spans: [{ text: '1,240' }], align: 'right' }, { spans: [{ text: '1,610', bold: true, color: 'green' }], align: 'right' }],
      [{ spans: [{ text: 'South' }] }, { spans: [{ text: '980' }], align: 'right' }, { spans: [{ text: '875', color: 'red' }], align: 'right' }],
    ] },
    { type: 'code', spans: [{ text: 'const editor = useSynTextEditor({ preset: "full", storage })\nreturn editor.render()' }] },
    { type: 'file', src: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', name: 'quarterly-report.pdf', bytes: 13264, mime: 'application/pdf', asset: 'f1', spans: [] },
    { type: 'p', spans: [] },
  ],
}

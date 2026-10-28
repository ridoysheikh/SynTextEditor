// ─── Dev page ────────────────────────────────────────────────────────────────
// Demos of the instance API:
//   word      — the full preset as a page on a desk, media gallery over in-memory storage
//   comment   — "basic": text weight and lists only, controlled, with the stored value rendered beside it
//   minimal   — "minimal", borderless, a one-line feel
//   themed    — `vars`, Tailwind `classNames`, and a theme switch, live
//   viewer    — the server-safe half: SynTextView and toHTML side by side
//   custom    — a toolbar of the host's own, built from the exported tools
//
// Every one of them is `useSynTextEditor(config)` + `{editor.render()}`.

import { useEffect, useMemo, useState } from 'react'
import { Bold, Italic } from 'lucide-react'
import { useEditorValue, useSynTextEditor } from '@syn/react'
import { createMemoryStorage } from '@syn/core/storage'
import { toHTML } from '@syn/core/html'
import type { RichDoc } from '@syn/core/model'
import { SynTextView } from '@syn/view/SynTextView'
import { ColorTool, ListTool, MarkTool, MediaTool, UndoTool, RedoTool } from '@syn/UI/toolbar/tools'
import { ToolButton } from '@syn/UI/primitives'
import { SEED, WORD_DOC } from '@test-preview/demo/sample'
import layoutCss from '@syn/styles/layout.css?inline'
import themeCss from '@syn/styles/theme.css?inline'

type Demo = 'word' | 'comment' | 'minimal' | 'themed' | 'viewer' | 'custom'
const DEMOS: { id: Demo; label: string }[] = [
  { id: 'word', label: 'Word processor' }, { id: 'comment', label: 'Comment (basic)' }, { id: 'minimal', label: 'Minimal' },
  { id: 'themed', label: 'Theming' }, { id: 'viewer', label: 'Viewer & HTML' }, { id: 'custom', label: 'Custom toolbar' },
]

export default function App () {
  const [demo, setDemo] = useState<Demo>('word')
  const [dark, setDark] = useState(false)
  return (
    <div className={dark ? 'dark' : ''}>
      <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <header className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-white/80 px-4 py-2 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
          <strong className="mr-3 text-sm tracking-tight">SynTextEditor</strong>
          {DEMOS.map(d => (
            <button key={d.id} onClick={() => setDemo(d.id)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${demo === d.id ? 'bg-blue-600 text-white' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'}`}>
              {d.label}
            </button>
          ))}
          <span className="flex-1" />
          <button onClick={() => setDark(v => !v)} className="rounded-md border border-zinc-200 px-3 py-1 text-xs dark:border-zinc-700">
            {dark ? 'Light' : 'Dark'} page
          </button>
        </header>
        <main className="mx-auto max-w-6xl p-4 md:p-6">
          {demo === 'word' && <WordDemo />}
          {demo === 'comment' && <CommentDemo />}
          {demo === 'minimal' && <MinimalDemo />}
          {demo === 'themed' && <ThemedDemo />}
          {demo === 'viewer' && <ViewerDemo />}
          {demo === 'custom' && <CustomToolbarDemo />}
        </main>
      </div>
    </div>
  )
}

function Note ({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">{children}</p>
}

function WordDemo () {
  const storage = useMemo(() => createMemoryStorage({ latency: 900, seed: SEED }), [])
  const editor = useSynTextEditor({
    preset: 'full',
    variant: 'document',
    value: WORD_DOC,
    storage,
    maxHeight: 'calc(100vh - 170px)',
    placeholder: 'Start writing…',
    onError: (e) => console.warn('[editor]', e.message),
  })
  useEffect(() => { (window as unknown as { __editor: unknown }).__editor = editor }, [editor])
  return (
    <>
      <Note>Full preset over in-memory storage (uploads report progress for ~1s). Paste or drop images straight in; open the media library from the toolbar.</Note>
      {editor.render()}
    </>
  )
}

function CommentDemo () {
  const [value, setValue] = useState<RichDoc | null>(null)
  const editor = useSynTextEditor({
    preset: 'basic',
    value,
    onChange: setValue,
    placeholder: 'Write a comment… try pasting rich text from a web page: only bold, italic, underline, strike, lists and links survive.',
    maxLength: 500,
    statusbar: true,
    minHeight: 120,
  })
  useEffect(() => { (window as unknown as { __editor: unknown }).__editor = editor }, [editor])
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <Note>Text weight and lists only. Controlled: <code>value</code> + <code>onChange</code>.</Note>
        {editor.render()}
        <div className="mt-2 flex gap-2">
          <button className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white" onClick={() => setValue(null)}>Reset (controlled)</button>
          <button className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-700" onClick={() => editor.setReadOnly(!editor.isReadOnly())}>Toggle read-only</button>
        </div>
      </div>
      <div>
        <Note>What a page shows (<code>&lt;SynTextView /&gt;</code>):</Note>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <SynTextView value={value} fallback={<span className="text-sm text-zinc-400">Nothing yet.</span>} />
        </div>
        <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-zinc-100 p-3 text-[11px] dark:bg-zinc-900">{JSON.stringify(value, null, 2)}</pre>
      </div>
    </div>
  )
}

function MinimalDemo () {
  const editor = useSynTextEditor({ preset: 'minimal', variant: 'borderless', placeholder: 'A note — Ctrl+B, Ctrl+I, Ctrl+K…', minHeight: 60 })
  const words = useEditorValue(editor, ['change'], e => e.getWords())
  return (
    <div className="max-w-xl">
      <Note>Bold, italic and links. Borderless, to sit inside a host's own card. Words: {words}</Note>
      <div className="rounded-xl border border-zinc-200 bg-white p-2 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">{editor.render()}</div>
    </div>
  )
}

const THEMES: Record<string, Record<string, string>> = {
  Default: {},
  Rose: { accent: '#e11d48', 'accent-hover': '#be123c', radius: '14px', 'radius-sm': '8px' },
  Forest: { accent: '#15803d', bg: '#fbfdf9', surface: '#eef5ea', border: '#d5e3cf', 'border-2': '#c2d6ba', 'content-font': "Georgia, 'Times New Roman', serif" },
  Mono: { accent: '#111111', 'accent-fg': '#ffffff', radius: '0px', 'radius-sm': '0px', font: "'JetBrains Mono', monospace", 'content-font': "'JetBrains Mono', monospace" },
}

function ThemedDemo () {
  const [theme, setTheme] = useState('Rose')
  const [mode, setMode] = useState<'inherit' | 'light' | 'dark'>('inherit')
  return (
    <>
      <Note>Each editor below is themed with <code>vars</code> (inline <code>--se-*</code> variables) and Tailwind <code>classNames</code> on its parts. The menus and dialogs carry the theme too.</Note>
      <div className="mb-3 flex flex-wrap gap-2">
        {Object.keys(THEMES).map(t => (
          <button key={t} onClick={() => setTheme(t)} className={`rounded-md px-3 py-1 text-xs ${theme === t ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'border border-zinc-300 dark:border-zinc-700'}`}>{t}</button>
        ))}
        <span className="mx-2 w-px bg-zinc-300 dark:bg-zinc-700" />
        {(['inherit', 'light', 'dark'] as const).map(m => (
          <button key={m} onClick={() => setMode(m)} className={`rounded-md px-3 py-1 text-xs ${mode === m ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'border border-zinc-300 dark:border-zinc-700'}`}>{m}</button>
        ))}
      </div>
      {/* A new key remounts: theme and vars are config, read once. */}
      <ThemedEditor key={theme + mode} vars={THEMES[theme]} mode={mode} />
    </>
  )
}
function ThemedEditor ({ vars, mode }: { vars: Record<string, string>; mode: 'inherit' | 'light' | 'dark' }) {
  const editor = useSynTextEditor({
    preset: 'standard',
    theme: mode,
    vars,
    value: 'A themed editor. Pick a theme or a mode above — the toolbar, menus and dialogs follow.',
    classNames: { root: 'shadow-xl shadow-zinc-900/5', toolbar: 'px-3', surface: 'min-h-48' },
    placeholder: 'Themed editor…',
  })
  return editor.render()
}

function ViewerDemo () {
  const [mode, setMode] = useState<'class' | 'inline'>('class')
  const html = toHTML(WORD_DOC, { mode })
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <Note><code>SynTextView</code> — server-safe React, no hooks. Import from <code>@syntext/react/view</code> in a Server Component.</Note>
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"><SynTextView value={WORD_DOC} /></div>
      </div>
      <div>
        <Note>
          <code>toHTML(doc, {'{'} mode {'}'})</code> — <button className="underline" onClick={() => setMode(mode === 'class' ? 'inline' : 'class')}>{mode}</button> mode
          {mode === 'inline' ? ' (self-contained, for email)' : ' (styled by layout.css + theme.css)'}.
        </Note>
        <iframe title="html" className="h-[360px] w-full rounded-lg border border-zinc-200 bg-white dark:border-zinc-800"
          srcDoc={mode === 'inline' ? `<body style="font-family:system-ui;padding:16px">${html}</body>` : `<style>${layoutCss}${themeCss}</style><body style="padding:16px">${html}</body>`} />
        <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-zinc-100 p-3 text-[11px] whitespace-pre-wrap break-all dark:bg-zinc-900">{html}</pre>
      </div>
    </div>
  )
}

function CustomToolbarDemo () {
  const storage = useMemo(() => createMemoryStorage({ seed: SEED }), [])
  const editor = useSynTextEditor({ toolbar: false, storage, placeholder: 'The toolbar above is the host page’s own markup, built from exported tools.', minHeight: 160 })
  return (
    <>
      <Note>No built-in toolbar (<code>toolbar: false</code>). The bar is host markup; the tools are exported components — and the instance works from anywhere.</Note>
      <div className="mb-2 flex flex-wrap items-center gap-1 rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900 se-scope">
        <UndoTool editor={editor} /><RedoTool editor={editor} />
        <span className="mx-1 h-5 w-px bg-zinc-200 dark:bg-zinc-700" />
        <MarkTool editor={editor} mark="bold" /><MarkTool editor={editor} mark="italic" />
        <ColorTool editor={editor} kind="color" />
        <ListTool editor={editor} kind="check" />
        <MediaTool editor={editor} kind="image" />
        <span className="mx-1 h-5 w-px bg-zinc-200 dark:bg-zinc-700" />
        <ToolButton label="Bold via the instance" onClick={() => editor.toggleBold()}><Bold /></ToolButton>
        <ToolButton label="Italic via the instance" onClick={() => editor.toggleItalic()}><Italic /></ToolButton>
        <button className="ml-auto rounded-md bg-blue-600 px-3 py-1 text-xs text-white" onMouseDown={e => e.preventDefault()} onClick={() => editor.insertText('Hello from outside! ')}>Insert text</button>
      </div>
      {editor.render()}
    </>
  )
}

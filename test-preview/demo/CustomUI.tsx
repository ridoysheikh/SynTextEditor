// ─── Custom UI demo ───────────────────────────────────────────────────────────
// The same editor with the library's own UI, or with parts swapped through `components` — live, no remount.
// Some replacements wrap the library's part (`Default`), some draw their own, and two toolbar tools are new.

import { useState } from 'react'
import { BadgeCheck, Check, Sigma } from 'lucide-react'
import { useEditorValue, useSynTextEditor } from '@syn/react'
import type { ComponentsConfig } from '@syn/UI/slots'
import { ColorPicker } from '@syn/UI/ColorPicker'
import { ToolButton, cx, keep } from '@syn/UI/primitives'
import { colorValue } from '@syn/core/styles'
import { WORD_DOC } from '@test-preview/demo/sample'

// Defined once, at module scope: a new component every render would remount that part.
const CUSTOM: ComponentsConfig = {
  // Wrap the library's button: same behaviour, rounder.
  Button: ({ Default, className, ...p }) => <Default {...p} className={cx(className, '!rounded-full !px-4')} />,

  // Wrap the library's dialog: add a badge to every dialog's title.
  Modal: ({ Default, title, ...p }) => (
    <Default {...p} title={<span className="flex items-center gap-2">{title}<span className="rounded bg-violet-600/15 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-violet-600">custom</span></span>} />
  ),

  // Draw our own tooltip.
  Tooltip: ({ text, kbd, rect }) => (
    <div role="tooltip" className="pointer-events-none fixed z-[1300] -translate-x-1/2 rounded-lg bg-violet-700 px-2 py-1 text-[11px] font-medium text-white shadow-lg"
      style={{ left: rect.left + rect.width / 2, top: rect.bottom + 8 }}>
      {text}{kbd && <span className="ml-1.5 rounded bg-white/20 px-1">{kbd}</span>}
    </div>
  ),

  // Our own menu rows: an accent bar marks the current choice.
  MenuItem: ({ children, icon, checked, kbd, disabled, onSelect, style }) => (
    <button type="button" role="menuitemradio" aria-checked={checked} disabled={disabled} style={style} onMouseDown={keep} onClick={onSelect}
      className={cx('flex w-full items-center gap-2 rounded-md border-l-2 px-2 py-1 text-left text-[12.5px] hover:bg-violet-500/10 disabled:opacity-40',
        checked ? 'border-violet-600 bg-violet-500/10 font-semibold' : 'border-transparent')}>
      {icon}<span className="min-w-0 flex-1 truncate">{children}</span>{kbd && <span className="text-[11px] opacity-50">{kbd}</span>}
    </button>
  ),

  // Our own slider (the image dialog's width uses it).
  Slider: ({ value, min = 0, max = 100, step = 1, onChange, label }) => (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: Math.floor((max - min) / (step * 2)) + 1 }, (_, i) => min + i * step * 2).map(v => (
        <button key={v} type="button" aria-label={`${label} ${v}`} aria-pressed={v <= value} onClick={() => onChange(v)}
          className={cx('h-5 flex-1 rounded-sm transition', v <= value ? 'bg-violet-600' : 'bg-zinc-300 dark:bg-zinc-700')} />
      ))}
    </div>
  ),

  // Our own colour menu — a list instead of a grid, with the library's picker underneath.
  ColorMenu: ({ kind, title, list, cur, onPick }) => (
    <div className="w-52 p-1">
      <div className="px-2 pb-1 text-[10.5px] font-semibold uppercase tracking-wider opacity-60">{title}</div>
      {[{ name: '', label: kind === 'color' ? 'Default' : 'None' }, ...list].map(s => (
        <button key={s.name} type="button" onMouseDown={keep} onClick={() => onPick(s.name || null)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12.5px] hover:bg-violet-500/10">
          <span className="size-3.5 rounded-full border border-black/10" style={{ background: s.name ? colorValue(s.name, kind) : 'transparent' }} />
          <span className="flex-1">{s.label}</span>
          {(cur ?? '') === s.name && <Check className="size-3.5 text-violet-600" />}
        </button>
      ))}
      <div className="mt-1 border-t border-black/10 pt-1 dark:border-white/10"><ColorPicker initial={cur?.startsWith('#') ? cur : undefined} onApply={onPick} /></div>
    </div>
  ),

  tools: {
    // Replace a built-in: the library's bold button, with a ring when active.
    bold: ({ editor, Default }) => <span className="rounded-md ring-violet-500/60 has-[[aria-pressed=true]]:ring-2">{Default && <Default editor={editor} />}</span>,
    // New tools — name them in `toolbar`.
    stamp: ({ editor }) => (
      <ToolButton label="Approved stamp" wide onClick={() => editor.insertText('✓ Approved ')}><BadgeCheck /><span className="se-btn-label">Stamp</span></ToolButton>
    ),
    words: function Words ({ editor }) {
      const n = useEditorValue(editor, ['change'], e => e.getWords())
      return <span className="inline-flex items-center gap-1 px-1.5 text-[11.5px] tabular-nums opacity-70"><Sigma className="size-3.5" />{n} words</span>
    },
  },
}

const TOOLBAR = [['undo', 'redo'], ['block', 'font'], ['bold', 'italic', 'underline'], ['color', 'highlight'], ['bullet', 'ordered'], ['link', 'image', 'table'], ['stamp', 'words']]

export function CustomUIDemo () {
  const [mode, setMode] = useState<'default' | 'custom'>('custom')
  const editor = useSynTextEditor({
    value: WORD_DOC,
    toolbar: TOOLBAR,
    components: mode === 'custom' ? CUSTOM : undefined,
    maxHeight: 480,
    vars: mode === 'custom' ? { accent: '#7c3aed' } : undefined,
  })
  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-zinc-500">UI:</span>
        {(['default', 'custom'] as const).map(m => (
          <button key={m} onClick={() => setMode(m)}
            className={`rounded-md border px-2.5 py-1 ${mode === m ? 'border-violet-600 bg-violet-600 text-white' : 'border-zinc-300 dark:border-zinc-700'}`}>
            {m === 'default' ? 'Library defaults' : 'Custom components'}
          </button>
        ))}
        <span className="text-zinc-500">
          Swapped: Button &amp; Modal (wrapping the default), Tooltip, MenuItem, Slider, ColorMenu (our own), the bold tool, and two new tools (Stamp, word count).
          Try the text style / font menus, colours, hover tooltips, and an image's details dialog.
        </span>
      </div>
      {editor.render()}
    </>
  )
}

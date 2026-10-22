'use client'

import { useCallback, useRef, useState } from 'react'
import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Link as LinkIcon,
  Check,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type ToolbarProps = {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

const btnClass = (disabled?: boolean) =>
  cn(
    'inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors',
    disabled
      ? 'text-zinc-400 dark:text-zinc-600 cursor-not-allowed'
      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/70 dark:hover:bg-zinc-700/60 hover:text-zinc-900 dark:hover:text-zinc-100 cursor-pointer'
  )

type WrapEdit = { next: string; selStart: number; selEnd: number }

/**
 * Toggle an inline markdown marker around the selection.
 * - Second press removes markers instead of stacking them
 * - Leading/trailing spaces in the selection stay outside the markers
 */
export function toggleInlineWrap(
  value: string,
  start: number,
  end: number,
  marker: string,
  placeholder = 'text'
): WrapEdit {
  const mLen = marker.length

  // Shrink selection to exclude leading/trailing whitespace
  let s = start
  let e = end
  while (s < e && /\s/.test(value[s]!)) s++
  while (e > s && /\s/.test(value[e - 1]!)) e--

  const leading = value.slice(start, s)
  const trailing = value.slice(e, end)
  const selected = value.slice(s, e)

  const isItalicStar = marker === '*'

  const hasExactMarkers = (text: string) => {
    if (text.length < mLen * 2) return false
    if (!text.startsWith(marker) || !text.endsWith(marker)) return false
    // Don't treat **bold** as *italic*
    if (isItalicStar && text.startsWith('**') && text.endsWith('**'))
      return false
    return true
  }

  const surroundedByMarkers = () => {
    if (s < mLen || e + mLen > value.length) return false
    if (value.slice(s - mLen, s) !== marker) return false
    if (value.slice(e, e + mLen) !== marker) return false
    // Don't treat **bold** surroundings as *italic*
    if (isItalicStar) {
      const boldLeft = s >= 2 && value[s - 2] === '*'
      const boldRight = value[e + 1] === '*'
      if (boldLeft || boldRight) return false
    }
    return true
  }

  // Already wrapped (markers included in selection) → unwrap
  if (selected && hasExactMarkers(selected)) {
    const inner = selected.slice(mLen, selected.length - mLen)
    const next =
      value.slice(0, start) + leading + inner + trailing + value.slice(end)
    const selStart = start + leading.length
    return { next, selStart, selEnd: selStart + inner.length }
  }

  // Markers sit just outside the (trimmed) selection → unwrap
  if (selected && surroundedByMarkers()) {
    const next = value.slice(0, s - mLen) + selected + value.slice(e + mLen)
    return {
      next,
      selStart: s - mLen,
      selEnd: s - mLen + selected.length,
    }
  }

  // Empty / whitespace-only selection → insert placeholder
  const inner = selected || placeholder
  const next =
    value.slice(0, start) +
    leading +
    marker +
    inner +
    marker +
    trailing +
    value.slice(end)
  const selStart = start + leading.length + mLen
  return { next, selStart, selEnd: selStart + inner.length }
}

function prefixSelectedLines(
  value: string,
  start: number,
  end: number,
  prefixForLine: (lineIndex: number) => string
) {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  let lineEnd = value.indexOf('\n', end)
  if (lineEnd === -1) lineEnd = value.length

  const block = value.slice(lineStart, lineEnd)
  const lines = block.split('\n')
  const nextBlock = lines
    .map((line, i) => {
      const p = prefixForLine(i)
      if (line.startsWith(p)) return line
      // Toggle off common heading/list prefixes when re-applying same style
      return (
        p +
        line
          .replace(/^#{1,6}\s+/, '')
          .replace(/^[-*+]\s+/, '')
          .replace(/^\d+\.\s+/, '')
          .replace(/^>\s?/, '')
      )
    })
    .join('\n')

  const next = value.slice(0, lineStart) + nextBlock + value.slice(lineEnd)
  return {
    next,
    selStart: lineStart,
    selEnd: lineStart + nextBlock.length,
  }
}

/**
 * Formatting toolbar for the raw markdown textarea.
 * Applies markdown markers around the current selection.
 */
export function MarkdownFormatToolbar({
  textareaRef,
  value,
  onChange,
  disabled,
}: ToolbarProps) {
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('https://')
  const linkInputRef = useRef<HTMLInputElement>(null)
  const savedRange = useRef<{ start: number; end: number } | null>(null)

  const applyEdit = useCallback(
    (edit: { next: string; selStart: number; selEnd: number }) => {
      onChange(edit.next)
      requestAnimationFrame(() => {
        const el = textareaRef.current
        if (!el) return
        el.focus()
        el.setSelectionRange(edit.selStart, edit.selEnd)
      })
    },
    [onChange, textareaRef]
  )

  const withSelection = useCallback(
    (
      fn: (
        start: number,
        end: number
      ) => { next: string; selStart: number; selEnd: number }
    ) => {
      if (disabled) return
      const el = textareaRef.current
      if (!el) return
      const start = el.selectionStart
      const end = el.selectionEnd
      applyEdit(fn(start, end))
    },
    [applyEdit, disabled, textareaRef]
  )

  const wrap = (marker: string, placeholder?: string) => {
    withSelection((start, end) =>
      toggleInlineWrap(value, start, end, marker, placeholder)
    )
  }

  const linePrefix = (prefix: string | ((i: number) => string)) => {
    withSelection((start, end) =>
      prefixSelectedLines(
        value,
        start,
        end,
        typeof prefix === 'function' ? prefix : () => prefix
      )
    )
  }

  const openLink = () => {
    if (disabled) return
    const el = textareaRef.current
    if (!el) return
    savedRange.current = {
      start: el.selectionStart,
      end: el.selectionEnd,
    }
    setLinkUrl('https://')
    setLinkOpen(true)
    requestAnimationFrame(() => linkInputRef.current?.select())
  }

  const applyLink = () => {
    const href = linkUrl.trim()
    setLinkOpen(false)
    const range = savedRange.current
    const el = textareaRef.current
    if (!range || !el) return
    if (!href || href === 'https://') return

    const { start, end } = range
    const selected = value.slice(start, end) || 'link'
    const before = '['
    const after = `](${href})`
    applyEdit({
      next:
        value.slice(0, start) + before + selected + after + value.slice(end),
      selStart: start + before.length,
      selEnd: start + before.length + selected.length,
    })
  }

  return (
    <div className='flex items-center gap-0.5 flex-wrap px-2 py-1.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/40 shrink-0 relative'>
      <button
        type='button'
        title='Bold (⌘/Ctrl+B)'
        aria-label='Bold'
        disabled={disabled}
        className={btnClass(disabled)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => wrap('**', 'bold')}
      >
        <Bold size={14} />
      </button>
      <button
        type='button'
        title='Italic (⌘/Ctrl+I)'
        aria-label='Italic'
        disabled={disabled}
        className={btnClass(disabled)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => wrap('*', 'italic')}
      >
        <Italic size={14} />
      </button>
      <button
        type='button'
        title='Strikethrough'
        aria-label='Strikethrough'
        disabled={disabled}
        className={btnClass(disabled)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => wrap('~~', 'strikethrough')}
      >
        <Strikethrough size={14} />
      </button>

      <div className='w-px h-4 bg-zinc-300 dark:bg-zinc-700 mx-1' />

      <button
        type='button'
        title='Heading 1'
        aria-label='Heading 1'
        disabled={disabled}
        className={btnClass(disabled)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => linePrefix('# ')}
      >
        <Heading1 size={14} />
      </button>
      <button
        type='button'
        title='Heading 2'
        aria-label='Heading 2'
        disabled={disabled}
        className={btnClass(disabled)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => linePrefix('## ')}
      >
        <Heading2 size={14} />
      </button>
      <button
        type='button'
        title='Heading 3'
        aria-label='Heading 3'
        disabled={disabled}
        className={btnClass(disabled)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => linePrefix('### ')}
      >
        <Heading3 size={14} />
      </button>

      <div className='w-px h-4 bg-zinc-300 dark:bg-zinc-700 mx-1' />

      <button
        type='button'
        title='Bullet list'
        aria-label='Bullet list'
        disabled={disabled}
        className={btnClass(disabled)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => linePrefix('- ')}
      >
        <List size={14} />
      </button>
      <button
        type='button'
        title='Numbered list'
        aria-label='Numbered list'
        disabled={disabled}
        className={btnClass(disabled)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => linePrefix((i) => `${i + 1}. `)}
      >
        <ListOrdered size={14} />
      </button>
      <button
        type='button'
        title='Blockquote'
        aria-label='Blockquote'
        disabled={disabled}
        className={btnClass(disabled)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => linePrefix('> ')}
      >
        <Quote size={14} />
      </button>
      <button
        type='button'
        title='Inline code'
        aria-label='Inline code'
        disabled={disabled}
        className={btnClass(disabled)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => wrap('`', 'code')}
      >
        <Code size={14} />
      </button>

      <div className='w-px h-4 bg-zinc-300 dark:bg-zinc-700 mx-1' />

      <button
        type='button'
        title='Link'
        aria-label='Link'
        disabled={disabled}
        className={btnClass(disabled)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={openLink}
      >
        <LinkIcon size={14} />
      </button>

      {linkOpen && (
        <div className='absolute top-full left-2 z-40 mt-1 flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 p-1.5 shadow-lg'>
          <input
            ref={linkInputRef}
            type='url'
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                applyLink()
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                setLinkOpen(false)
              }
            }}
            placeholder='https://…'
            className='w-56 sm:w-72 px-2 py-1 text-xs rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500'
          />
          <button
            type='button'
            title='Apply link'
            aria-label='Apply link'
            className={btnClass(false)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={applyLink}
          >
            <Check size={14} />
          </button>
          <button
            type='button'
            title='Cancel'
            aria-label='Cancel'
            className={btnClass(false)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setLinkOpen(false)}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

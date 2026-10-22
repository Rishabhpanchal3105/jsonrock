'use client'

import React, { useEffect, useRef } from 'react'
import { useEditor, EditorContent, ReactNodeViewRenderer } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import CodeBlock from '@tiptap/extension-code-block'
import { Link as TiptapLink } from '@tiptap/extension-link'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { MarkdownCodeBlockView } from './editor/MarkdownCodeBlockView'
import { cn } from '@/lib/utils'

/** Split YAML front matter so TipTap renders only the markdown body. */
export function splitMarkdownFrontMatter(content: string): {
  prefix: string
  body: string
} {
  if (!content.startsWith('---')) {
    return { prefix: '', body: content }
  }
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
  if (!match) {
    return { prefix: '', body: content }
  }
  return { prefix: match[0], body: content.slice(match[0].length) }
}

function normalizeMarkdown(md: string): string {
  return md.replace(/\r\n/g, '\n').replace(/\n+$/, '')
}

interface MarkdownPreviewEditorProps {
  content: string
  scrollRef?: React.RefObject<HTMLDivElement | null>
  onScroll?: () => void
  frontMatterBanner?: React.ReactNode
}

/**
 * Read-only markdown preview powered by TipTap + @tiptap/markdown.
 * Syncs one-way from the raw markdown source (`content`).
 */
export default function MarkdownPreviewEditor({
  content,
  scrollRef,
  onScroll,
  frontMatterBanner,
}: MarkdownPreviewEditorProps) {
  const lastContentRef = useRef<string | null>(null)
  const initial = splitMarkdownFrontMatter(content)

  const editor = useEditor({
    immediatelyRender: false,
    editable: false,
    extensions: [
      StarterKit.configure({
        link: false,
        codeBlock: false,
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        bulletList: {
          HTMLAttributes: {
            class: 'list-disc pl-6 mb-4 space-y-1.5',
          },
        },
        orderedList: {
          HTMLAttributes: {
            class: 'list-decimal pl-6 mb-4 space-y-1.5',
          },
        },
        blockquote: {
          HTMLAttributes: {
            class:
              'border-l-4 border-emerald-500 dark:border-emerald-400 pl-4 py-0.5 my-4 bg-emerald-50 dark:bg-emerald-950/20 rounded-r-md italic',
          },
        },
        code: {
          HTMLAttributes: {
            class:
              'px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800/50 text-emerald-600 dark:text-emerald-400 font-mono text-[0.875em] border border-zinc-200 dark:border-zinc-700/50',
          },
        },
      }),
      CodeBlock.configure({
        languageClassPrefix: 'language-',
      }).extend({
        addNodeView() {
          return ReactNodeViewRenderer(MarkdownCodeBlockView)
        },
      }),
      Table.configure({
        resizable: false,
        HTMLAttributes: {
          class:
            'border-collapse table-fixed w-full border border-zinc-300 dark:border-zinc-700 my-4',
        },
      }),
      TableRow.configure({
        HTMLAttributes: {
          class: 'border-b border-zinc-300 dark:border-zinc-700',
        },
      }),
      TableHeader.configure({
        HTMLAttributes: {
          class:
            'border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2 text-left font-semibold relative',
        },
      }),
      TableCell.configure({
        HTMLAttributes: {
          class:
            'border border-zinc-300 dark:border-zinc-700 px-3 py-2 relative',
        },
      }),
      TiptapLink.configure({
        openOnClick: true,
        autolink: true,
        defaultProtocol: 'https',
        HTMLAttributes: {
          class:
            'text-emerald-600 dark:text-emerald-400 underline underline-offset-2',
          target: '_blank',
          rel: 'noopener noreferrer nofollow',
        },
      }),
      Markdown,
    ],
    content: initial.body,
    contentType: 'markdown',
    editorProps: {
      attributes: {
        class: cn(
          'tiptap markdown-preview-editor focus:outline-none min-h-full',
          'text-zinc-700 dark:text-zinc-300 leading-7'
        ),
      },
    },
  })

  // Source → Preview only
  useEffect(() => {
    if (!editor) return
    if (
      lastContentRef.current !== null &&
      normalizeMarkdown(content) === normalizeMarkdown(lastContentRef.current)
    ) {
      return
    }

    const { body } = splitMarkdownFrontMatter(content)
    const current = normalizeMarkdown(editor.getMarkdown())
    const incoming = normalizeMarkdown(body)
    if (current === incoming) {
      lastContentRef.current = content
      return
    }

    // Preserve scroll so content updates don't jump the preview mid-scroll
    const scroller = scrollRef?.current
    const savedTop = scroller?.scrollTop ?? 0

    editor.commands.setContent(body, {
      contentType: 'markdown',
      emitUpdate: false,
    })
    lastContentRef.current = content

    if (scroller) {
      scroller.scrollTop = savedTop
      // Restore again after layout (mermaid / images / tables)
      requestAnimationFrame(() => {
        if (scroller) scroller.scrollTop = savedTop
      })
    }
  }, [content, editor, scrollRef])

  useEffect(() => {
    return () => {
      editor?.destroy()
    }
  }, [editor])

  if (!editor) {
    return (
      <div className='h-full p-8 text-sm text-zinc-400 dark:text-zinc-600 italic'>
        Loading preview…
      </div>
    )
  }

  return (
    <div
      ref={scrollRef}
      className='h-full overflow-y-auto p-8 [overflow-anchor:none]'
      onScroll={onScroll}
    >
      {frontMatterBanner}
      <EditorContent editor={editor} />
    </div>
  )
}

'use client'

import {
  NodeViewContent,
  NodeViewWrapper,
  type NodeViewProps,
} from '@tiptap/react'
import { MermaidDiagram } from './MermaidDiagram'
import { FencedCodeBlock } from './FencedCodeBlock'
import { cn } from '@/lib/utils'

/**
 * TipTap code-block NodeView for the markdown preview.
 * - ```mermaid → diagram
 * - other fenced languages → highlighted card
 * - plain fences → monospace block
 */
export function MarkdownCodeBlockView({ node }: NodeViewProps) {
  const language = ((node.attrs.language as string | null) || '').trim()
  const isMermaid = language === 'mermaid'
  const code = node.textContent

  if (isMermaid) {
    return (
      <NodeViewWrapper
        as='div'
        className='markdown-mermaid-block my-3'
        data-language='mermaid'
      >
        <MermaidDiagram chart={code} />
        <div className='sr-only' aria-hidden>
          <NodeViewContent />
        </div>
      </NodeViewWrapper>
    )
  }

  if (language) {
    return (
      <NodeViewWrapper as='div' data-language={language}>
        <FencedCodeBlock language={language} code={code} />
        <div className='sr-only' aria-hidden>
          <NodeViewContent />
        </div>
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper as='div' className='my-3'>
      <pre
        className={cn(
          'rounded-xl bg-[#fafafa] dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700',
          'p-4 font-mono text-sm overflow-x-auto text-zinc-800 dark:text-zinc-200'
        )}
      >
        <code>
          <NodeViewContent />
        </code>
      </pre>
    </NodeViewWrapper>
  )
}

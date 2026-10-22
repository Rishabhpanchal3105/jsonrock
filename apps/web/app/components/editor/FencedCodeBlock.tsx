'use client'

import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import {
  vscDarkPlus,
  oneLight,
} from 'react-syntax-highlighter/dist/esm/styles/prism'
import { cn } from '@/lib/utils'

const getIsDarkMode = () =>
  typeof document !== 'undefined' &&
  document.documentElement.classList.contains('dark')

function CopyIconButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore clipboard failures
    }
  }

  return (
    <button
      type='button'
      onClick={handleCopy}
      title={copied ? 'Copied' : 'Copy code'}
      aria-label={copied ? 'Copied' : 'Copy code'}
      className={cn(
        'inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors',
        'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200/70',
        'dark:text-zinc-500 dark:hover:text-zinc-200 dark:hover:bg-zinc-700/60 cursor-pointer'
      )}
    >
      {copied ? (
        <Check className='w-3.5 h-3.5 text-emerald-500' />
      ) : (
        <Copy className='w-3.5 h-3.5 ' />
      )}
    </button>
  )
}

type FencedCodeBlockProps = {
  language: string
  code: string
  className?: string
}

/**
 * Minimal fenced code card: language label + copy, light border, Prism highlight.
 * Matches the markdown preview code-block design.
 */
export function FencedCodeBlock({
  language,
  code,
  className,
}: FencedCodeBlockProps) {
  const [isDark, setIsDark] = useState(getIsDarkMode)
  const trimmed = code.replace(/\n$/, '')

  useEffect(() => {
    const syncTheme = () => setIsDark(getIsDarkMode())
    syncTheme()
    const observer = new MutationObserver(syncTheme)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    return () => observer.disconnect()
  }, [])

  return (
    <div
      className={cn(
        'my-4 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700',
        'bg-[#fafafa] dark:bg-zinc-900 shadow-none min-h-28',
        className
      )}
    >
      <div className='flex items-center justify-between gap-2 px-5 pt-4 pb-2'>
        <span className='text-xs font-medium lowercase text-zinc-400 dark:text-zinc-500 select-none'>
          {language}
        </span>
        <CopyIconButton code={trimmed} />
      </div>
      <SyntaxHighlighter
        language={language}
        style={isDark ? vscDarkPlus : oneLight}
        customStyle={{
          margin: 0,
          borderRadius: 0,
          fontSize: '0.9rem',
          lineHeight: 1.65,
          padding: '0.35rem 1.25rem 1.25rem',
          background: 'transparent',
          minHeight: '4.5rem',
        }}
        codeTagProps={{
          style: {
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          },
        }}
        showLineNumbers={false}
        wrapLongLines={false}
      >
        {trimmed}
      </SyntaxHighlighter>
    </div>
  )
}

'use client'

import { memo, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

const mermaidCache = new Map<string, string>()
const mermaidPrefixCache = new Map<string, string>()

/** Bump when layout/theme density changes so in-memory cache doesn't keep old large SVGs. */
const MERMAID_LAYOUT_VERSION = 'compact-v2'

const MAX_CACHE_ENTRIES = 40

const getIsDarkMode = () =>
  typeof document !== 'undefined' &&
  document.documentElement.classList.contains('dark')

const compactThemeVariables = {
  fontSize: '11px',
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
}

const getMermaidConfig = (isDark: boolean) => ({
  startOnLoad: false,
  securityLevel: 'loose' as const,
  theme: isDark ? ('dark' as const) : ('default' as const),
  flowchart: {
    htmlLabels: true,
    curve: 'basis' as const,
    padding: 6,
    nodeSpacing: 20,
    rankSpacing: 24,
    wrappingWidth: 160,
    useMaxWidth: true,
  },
  sequence: {
    actorMargin: 28,
    boxMargin: 4,
    boxTextMargin: 3,
    noteMargin: 5,
    messageMargin: 22,
    mirrorActors: false,
    useMaxWidth: true,
  },
  themeVariables: isDark
    ? {
        ...compactThemeVariables,
        background: '#18181b',
        primaryColor: '#27272a',
        primaryTextColor: '#fafafa',
        primaryBorderColor: '#a1a1aa',
        secondaryColor: '#3f3f46',
        secondaryTextColor: '#f4f4f5',
        secondaryBorderColor: '#71717a',
        tertiaryColor: '#27272a',
        tertiaryTextColor: '#f4f4f5',
        tertiaryBorderColor: '#52525b',
        lineColor: '#a1a1aa',
        textColor: '#fafafa',
        mainBkg: '#27272a',
        nodeBorder: '#a1a1aa',
        clusterBkg: '#27272a',
        titleColor: '#fafafa',
        edgeLabelBackground: '#27272a',
        actorBkg: '#3f3f46',
        actorBorder: '#a78bfa',
        actorTextColor: '#fafafa',
        actorLineColor: '#71717a',
        signalColor: '#e4e4e7',
        signalTextColor: '#fafafa',
        labelBoxBkgColor: '#27272a',
        labelBoxBorderColor: '#71717a',
        labelTextColor: '#fafafa',
        loopTextColor: '#fafafa',
        noteBkgColor: '#3f3f46',
        noteTextColor: '#fafafa',
        noteBorderColor: '#71717a',
        activationBkgColor: '#52525b',
        activationBorderColor: '#a1a1aa',
        sequenceNumberColor: '#18181b',
      }
    : {
        ...compactThemeVariables,
      },
})

type MermaidApi = typeof import('mermaid').default

let mermaidModulePromise: Promise<MermaidApi> | null = null
let initializedTheme: 'dark' | 'light' | null = null
let renderSeq = 0
/** Serialize renders — concurrent mermaid.render calls fight over the DOM. */
let renderChain: Promise<unknown> = Promise.resolve()

function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidModulePromise) {
    mermaidModulePromise = import('mermaid').then((m) => m.default)
  }
  return mermaidModulePromise
}

/** Prefetch the mermaid chunk (e.g. when the markdown editor mounts). */
export function preloadMermaid(): void {
  void loadMermaid()
}

async function getMermaid(isDark: boolean): Promise<MermaidApi> {
  const mermaid = await loadMermaid()
  const theme = isDark ? 'dark' : 'light'
  if (initializedTheme !== theme) {
    mermaid.initialize(getMermaidConfig(isDark))
    initializedTheme = theme
  }
  return mermaid
}

function trimCache(cache: Map<string, string>) {
  if (cache.size <= MAX_CACHE_ENTRIES) return
  const excess = cache.size - MAX_CACHE_ENTRIES
  const keys = cache.keys()
  for (let i = 0; i < excess; i++) {
    const key = keys.next().value
    if (key !== undefined) cache.delete(key)
  }
}

function cacheSet(cacheKey: string, prefixKey: string, svg: string) {
  mermaidCache.set(cacheKey, svg)
  mermaidPrefixCache.set(prefixKey, svg)
  trimCache(mermaidCache)
  trimCache(mermaidPrefixCache)
}

function enqueueRender<T>(task: () => Promise<T>): Promise<T> {
  const run = renderChain.then(task, task)
  // Keep the chain alive even if a task fails
  renderChain = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

type MermaidDiagramProps = {
  chart: string
}

/** Renders a Mermaid chart to SVG, with theme-aware caching. */
export const MermaidDiagram = memo(function MermaidDiagram({
  chart,
}: MermaidDiagramProps) {
  const trimmed = chart.trim()
  const prefix = trimmed.substring(0, 30)
  const [isDark, setIsDark] = useState(getIsDarkMode)
  const themeKey = isDark ? 'dark' : 'light'
  const cacheKey = `${MERMAID_LAYOUT_VERSION}:${themeKey}:${trimmed}`
  const prefixKey = `${MERMAID_LAYOUT_VERSION}:${themeKey}:${prefix}`

  const [svg, setSvg] = useState<string>(() => {
    return mermaidCache.get(cacheKey) || mermaidPrefixCache.get(prefixKey) || ''
  })
  const [isRendering, setIsRendering] = useState(
    () => !mermaidCache.has(cacheKey)
  )

  // Keep theme in sync when the app toggles dark/light mode
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

  // Warm the mermaid chunk as soon as a diagram mounts
  useEffect(() => {
    void loadMermaid()
  }, [])

  useEffect(() => {
    if (!trimmed) {
      setSvg('')
      setIsRendering(false)
      return
    }

    const cached = mermaidCache.get(cacheKey)
    if (cached) {
      setSvg(cached)
      setIsRendering(false)
      return
    }

    // Keep last valid diagram visible while typing (anti-blink)
    const cachedPrefix = mermaidPrefixCache.get(prefixKey)
    if (cachedPrefix) {
      setSvg(cachedPrefix)
    } else {
      setIsRendering(true)
    }

    let cancelled = false
    // First paint: render immediately. While editing: debounce to avoid thrashing.
    const delayMs = cachedPrefix ? 220 : 0

    const timeoutId = setTimeout(() => {
      void enqueueRender(async () => {
        if (cancelled) return
        try {
          const mermaid = await getMermaid(isDark)
          if (cancelled) return
          // Skip mermaid.parse() — render() already validates; parse doubles the cost.
          const renderId = `mmd-${++renderSeq}`
          const { svg: newSvg } = await mermaid.render(renderId, trimmed)
          if (cancelled) return
          cacheSet(cacheKey, prefixKey, newSvg)
          setSvg(newSvg)
        } catch {
          // keep last valid svg on parse/render error
        } finally {
          if (!cancelled) setIsRendering(false)
        }
      })
    }, delayMs)

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [trimmed, cacheKey, prefixKey, isDark])

  if (!trimmed) return null

  if (!svg) {
    return (
      <pre className='bg-zinc-50 dark:bg-zinc-900/50 p-3 rounded text-sm text-zinc-500 italic border border-zinc-200 dark:border-zinc-800 my-3'>
        {isRendering ? 'Rendering diagram…' : 'Invalid Mermaid diagram'}
      </pre>
    )
  }

  return (
    <div
      dangerouslySetInnerHTML={{ __html: svg }}
      className={cn(
        'mermaid-diagram flex justify-center my-3 overflow-x-auto rounded-lg p-2 shadow-sm border',
        '[&_svg]:max-w-full [&_svg]:h-auto',
        '[&_.nodeLabel]:text-[10px] [&_.nodeLabel]:leading-snug',
        '[&_.edgeLabel]:text-[9px] [&_.edgeLabel]:leading-tight',
        '[&_foreignObject_div]:!p-0 [&_foreignObject_span]:!leading-snug',
        isRendering && 'opacity-90',
        isDark ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-zinc-200'
      )}
    />
  )
})

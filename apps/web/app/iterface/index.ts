export type ShareType = 'json' | 'text' | 'markdown' | 'html'

export function getEditorBasePath(type: ShareType): string {
  switch (type) {
    case 'text':
      return '/editor/text'
    case 'markdown':
      return '/editor/markdown'
    case 'html':
      return '/editor/html'
    default:
      return '/editor'
  }
}

/**
 * Canonical document URL path + fragment — same format as the browser address bar.
 * Use for history updates, share modal, clipboard, and email so there is one link type.
 */
export function buildDocumentUrl(input: {
  type: ShareType
  slug: string
  /** JSON view mode (`formatter` | `visualize` | …). Ignored for non-json types. */
  viewMode?: string
  /** Public encryption key. Omit / empty for private links. */
  keyString?: string | null
  isPrivate?: boolean
  /** Defaults to `window.location.origin` in the browser. */
  origin?: string
}): string {
  const base = getEditorBasePath(input.type)
  const viewParam =
    input.type === 'json' && input.viewMode ? `?view=${input.viewMode}` : ''
  const fragment =
    !input.isPrivate && input.keyString ? `#key=${input.keyString}` : ''
  const path = `${base}/${input.slug}${viewParam}${fragment}`
  if (input.origin) return `${input.origin.replace(/\/$/, '')}${path}`
  return path
}

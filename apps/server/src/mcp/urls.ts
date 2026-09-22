import { JsonShareMode, ShareType } from '../models/share.model'

export function getSiteUrl(): string {
  const configured = process.env.SITE_URL?.trim()
  if (configured) return configured.replace(/\/$/, '')
  if (process.env.NODE_ENV === 'production') return 'https://jsonrock.com'
  return 'http://localhost:3000'
}

export function buildShareUrl(input: {
  type: ShareType
  slug: string
  mode: JsonShareMode
  keyString?: string
}): string {
  const origin = getSiteUrl()
  let path: string
  switch (input.type) {
    case 'text':
      path = `/editor/text/${input.slug}`
      break
    case 'markdown':
      path = `/editor/markdown/${input.slug}`
      break
    case 'html':
      path = `/editor/html/${input.slug}`
      break
    default:
      path = `/editor/${input.slug}?view=${input.mode}`
  }
  const fragment = input.keyString ? `#key=${input.keyString}` : ''
  return `${origin}${path}${fragment}`
}

export function parseShareReference(input: string): {
  slug: string
  key?: string
} {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error('A document slug or share URL is required')
  }

  if (
    !trimmed.includes('/') &&
    !trimmed.includes('#') &&
    !trimmed.includes('?')
  ) {
    return { slug: trimmed }
  }

  const hashIndex = trimmed.indexOf('#')
  const beforeHash = hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed
  const hash = hashIndex >= 0 ? trimmed.slice(hashIndex + 1) : ''
  const key = new URLSearchParams(hash).get('key') || undefined

  let pathname = beforeHash
  try {
    pathname = new URL(trimmed).pathname
  } catch {
    const queryIndex = beforeHash.indexOf('?')
    pathname = queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash
  }

  const slug = pathname.split('/').filter(Boolean).pop() || ''
  if (!/^[A-Za-z0-9_-]{1,20}$/.test(slug)) {
    throw new Error('Could not read a document id from that link')
  }
  return { slug, key }
}

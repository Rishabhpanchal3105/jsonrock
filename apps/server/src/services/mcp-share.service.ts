import { ShareService } from './share.service'
import { UserService } from './user.service'
import ShareLink, {
  IShareLink,
  JsonShareMode,
  ShareAccessType,
  ShareType,
} from '../models/share.model'
import { AccessTypeEnum, ModeEnum, ShareTypeEnum } from '../enums/enum'
import {
  contentKeyFromFragment,
  decryptContent,
  deriveKeyFromPassword,
  encryptContent,
  generateContentKey,
  generateSalt,
  unwrapContentKey,
  wrapContentKey,
} from '../mcp/crypto'
import { buildShareUrl } from '../mcp/urls'

const MAX_CONTENT_CHARS = 1_500_000

export class McpShareError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'McpShareError'
  }
}

export interface CreateMcpShareInput {
  content: string
  type: ShareType
  mode?: JsonShareMode
  access?: ShareAccessType
  previewOnly?: boolean
  password?: string
}

export interface UpdateMcpShareInput {
  slug: string
  content: string
  password?: string
  key?: string
}

export interface ChangeMcpShareAccessInput {
  slug: string
  access: ShareAccessType
  key?: string
}

export interface ReadMcpShareInput {
  slug: string
  password?: string
  key?: string
}

const shareService = new ShareService()
const userService = new UserService()

function assertContent(content: string, type: ShareType): string {
  if (content.length > MAX_CONTENT_CHARS) {
    throw new McpShareError(
      `Content is too large. Keep it under ${MAX_CONTENT_CHARS.toLocaleString()} characters.`
    )
  }
  if (type === ShareTypeEnum.JSON) {
    try {
      JSON.parse(content)
    } catch {
      throw new McpShareError(
        'Content is not valid JSON. Fix the JSON, or set type to text, markdown, or html.'
      )
    }
  }
  return content
}

function isLegacy(record: IShareLink): boolean {
  return (
    !record.schemaVersion ||
    record.schemaVersion === 1 ||
    (Boolean(record.json) && !record.ciphertext)
  )
}

function shareSummary(
  record: IShareLink,
  url: string,
  extra?: { password?: string }
): string {
  const lines = [
    'Share link ready.',
    '',
    `URL: ${url}`,
    `Type: ${record.type}`,
    `Access: ${record.accessType}`,
    `Privacy: ${record.isPrivate ? 'private' : 'public'}`,
    `Slug: ${record.slug}`,
  ]
  if (record.type === ShareTypeEnum.JSON) {
    lines.push(`View: ${record.mode}`)
  }
  if (record.type === ShareTypeEnum.MARKDOWN && record.previewOnly) {
    lines.push('Markdown: preview only for people who are not the owner')
  }
  if (record.isPrivate) {
    lines.push(
      '',
      'Recipients need this link and the password. The password is not stored.',
      `Password: ${extra?.password || '(unchanged — use the password set when the link was created)'}`
    )
  } else {
    lines.push(
      '',
      'Share the full URL, including the #key= fragment. Without it the page cannot decrypt the document.'
    )
  }
  lines.push('', 'Links expire 30 days after they are created.')
  return lines.join('\n')
}

async function wrapForOwner(
  userId: string,
  contentKey: Buffer
): Promise<string> {
  const secret = await userService.getOrCreateKeyWrapSecret(userId)
  return wrapContentKey(contentKey, secret)
}

async function keyFromStoredWrap(
  record: IShareLink,
  userId: string
): Promise<Buffer | null> {
  if (!record.contentKeyWrapped || record.ownerId !== userId) return null
  const secret = await userService.getOrCreateKeyWrapSecret(userId)
  return unwrapContentKey(record.contentKeyWrapped, secret)
}

async function resolveContentKey(
  record: IShareLink,
  userId: string,
  input: { key?: string; password?: string }
): Promise<Buffer> {
  if (input.key) {
    try {
      return contentKeyFromFragment(input.key)
    } catch {
      throw new McpShareError(
        'The #key= fragment is not a valid document key. Pass the full share URL.'
      )
    }
  }

  if (input.password) {
    if (!record.salt) {
      throw new McpShareError(
        'This document is not password-protected. Pass the full share URL, including #key=.'
      )
    }
    return deriveKeyFromPassword(input.password, record.salt)
  }

  const stored = await keyFromStoredWrap(record, userId)
  if (stored) return stored

  if (record.isPrivate) {
    throw new McpShareError('This document is private. Pass its password.')
  }
  throw new McpShareError(
    'This public link is missing its #key= fragment. Pass the full share URL.'
  )
}

export class McpShareService {
  async createShare(
    userId: string,
    input: CreateMcpShareInput
  ): Promise<string> {
    const type = input.type
    const content = assertContent(input.content, type)
    const mode =
      type === ShareTypeEnum.JSON
        ? input.mode || ModeEnum.FORMATTER
        : ModeEnum.FORMATTER
    const access = input.access || AccessTypeEnum.VIEWER
    const previewOnly =
      type === ShareTypeEnum.MARKDOWN && input.previewOnly === true
    const password = input.password?.trim()
    if (input.password !== undefined && (!password || password.length < 4)) {
      throw new McpShareError('Password must be at least 4 characters.')
    }
    const isPrivate = Boolean(password)

    let key: Buffer
    let keyString: string | undefined
    let salt: string | undefined
    if (isPrivate && password) {
      salt = generateSalt()
      key = deriveKeyFromPassword(password, salt)
    } else {
      const generated = generateContentKey()
      key = generated.key
      keyString = generated.keyString
    }

    const encrypted = encryptContent(content, key)
    const wrapped = await wrapForOwner(userId, key)

    const record = await shareService.createShareLink({
      ownerId: userId,
      schemaVersion: 2,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      salt,
      ownerKeyWrapped: isPrivate ? wrapped : undefined,
      contentKeyWrapped: wrapped,
      mode,
      isPrivate,
      accessType: access,
      previewOnly,
      type,
    })

    const url = buildShareUrl({
      type: record.type,
      slug: record.slug,
      mode: record.mode,
      keyString: isPrivate ? undefined : keyString,
    })
    return shareSummary(record, url, { password: password || undefined })
  }

  async updateShare(
    userId: string,
    input: UpdateMcpShareInput
  ): Promise<string> {
    const existing = await shareService.getShareLink(input.slug)
    if (!existing) throw new McpShareError('Document not found.')
    if (!existing.ownerId || existing.ownerId !== userId) {
      throw new McpShareError(
        'You can only update documents created with this account.'
      )
    }

    const type = existing.type
    const content = assertContent(input.content, type)
    const mode = existing.mode
    const access = existing.accessType
    const previewOnly = existing.previewOnly === true

    let key: Buffer
    let salt = existing.salt
    if (isLegacy(existing)) {
      if (existing.isPrivate) {
        if (!input.password) {
          throw new McpShareError(
            'This private document needs its password before it can be updated.'
          )
        }
        salt = existing.salt || generateSalt()
        key = deriveKeyFromPassword(input.password, salt)
      } else if (input.key) {
        try {
          key = contentKeyFromFragment(input.key)
        } catch {
          throw new McpShareError(
            'The #key= fragment is not a valid document key. Pass the full share URL.'
          )
        }
      } else {
        key = generateContentKey().key
      }
    } else {
      key = await resolveContentKey(existing, userId, {
        key: input.key,
        password: input.password,
      })
    }

    const encrypted = encryptContent(content, key)
    const wrapped = await wrapForOwner(userId, key)
    const keyString = existing.isPrivate ? undefined : key.toString('base64url')

    const updated = await shareService.updateShareLink(existing.slug, {
      ownerId: userId,
      schemaVersion: 2,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      salt: existing.isPrivate ? salt : undefined,
      ownerKeyWrapped: existing.isPrivate ? wrapped : null,
      contentKeyWrapped: wrapped,
      mode,
      isPrivate: existing.isPrivate,
      accessType: access,
      previewOnly,
      type,
    })
    if (!updated) throw new McpShareError('Document not found.')

    const url = buildShareUrl({
      type: updated.type,
      slug: updated.slug,
      mode: updated.mode,
      keyString,
    })
    return shareSummary(updated, url, {
      password: input.password,
    })
  }

  async changeShareAccess(
    userId: string,
    input: ChangeMcpShareAccessInput
  ): Promise<string> {
    const existing = await shareService.getShareLink(input.slug)
    if (!existing) throw new McpShareError('Document not found.')
    if (!existing.ownerId || existing.ownerId !== userId) {
      throw new McpShareError(
        'You can only change access for documents created with this account.'
      )
    }

    let keyString: string | undefined
    if (!existing.isPrivate) {
      if (input.key) {
        try {
          keyString = contentKeyFromFragment(input.key).toString('base64url')
        } catch {
          throw new McpShareError(
            'The #key= fragment is not a valid document key. Pass the full share URL.'
          )
        }
      } else {
        const storedKey = await keyFromStoredWrap(existing, userId)
        keyString = storedKey?.toString('base64url')
      }
    }

    const updated = await ShareLink.findOneAndUpdate(
      { slug: existing.slug, ownerId: userId },
      { $set: { accessType: input.access } },
      { new: true }
    )
    if (!updated) throw new McpShareError('Document not found.')

    const url = buildShareUrl({
      type: updated.type,
      slug: updated.slug,
      mode: updated.mode,
      keyString,
    })

    return [
      'Share access updated.',
      '',
      `URL: ${url}`,
      `Access: ${updated.accessType}`,
      `Slug: ${updated.slug}`,
      '',
      keyString
        ? 'Share the full URL, including the #key= fragment.'
        : updated.isPrivate
          ? 'Recipients still need the document password.'
          : 'Use the original full share URL because its encryption key is not stored in the URL above.',
    ].join('\n')
  }

  async readShare(userId: string, input: ReadMcpShareInput): Promise<string> {
    const record = await shareService.getShareLink(input.slug)
    if (!record) throw new McpShareError('Document not found.')

    if (isLegacy(record)) {
      if (record.isPrivate) {
        if (!input.password) {
          throw new McpShareError(
            'This document is private. Pass its password.'
          )
        }
        const valid = shareService.verifyLegacyPassword(record, input.password)
        if (!valid) throw new McpShareError('Password is incorrect.')
      }
      return [
        `Slug: ${record.slug}`,
        `Type: ${record.type}`,
        `Privacy: ${record.isPrivate ? 'private' : 'public'}`,
        '',
        record.json || '',
      ].join('\n')
    }

    const key = await resolveContentKey(record, userId, {
      key: input.key,
      password: input.password,
    })

    let content: string
    try {
      content = decryptContent(record.ciphertext || '', record.iv || '', key)
    } catch {
      throw new McpShareError(
        'Could not decrypt this document. Check the full share URL or password.'
      )
    }

    const url = buildShareUrl({
      type: record.type,
      slug: record.slug,
      mode: record.mode,
      keyString: record.isPrivate ? undefined : key.toString('base64url'),
    })

    return [
      `URL: ${url}`,
      `Type: ${record.type}`,
      `Access: ${record.accessType}`,
      `Privacy: ${record.isPrivate ? 'private' : 'public'}`,
      '',
      content,
    ].join('\n')
  }

  async listShares(userId: string, limit: number): Promise<string> {
    const records = await ShareLink.find({ ownerId: userId })
      .sort({ updatedAt: -1 })
      .limit(limit)

    if (records.length === 0) {
      return 'No documents yet. Use create_share to publish one.'
    }

    const lines: string[] = [
      `${records.length} document${records.length === 1 ? '' : 's'} on this account.`,
      'Links expire 30 days after creation.',
      '',
    ]

    for (const record of records) {
      let url = buildShareUrl({
        type: record.type,
        slug: record.slug,
        mode: record.mode,
      })
      let note = ''
      if (!record.isPrivate && record.contentKeyWrapped) {
        try {
          const key = await keyFromStoredWrap(record, userId)
          if (key) {
            url = buildShareUrl({
              type: record.type,
              slug: record.slug,
              mode: record.mode,
              keyString: key.toString('base64url'),
            })
          }
        } catch {
          note = ' (encryption key could not be restored)'
        }
      } else if (!record.isPrivate && !record.contentKeyWrapped) {
        note =
          ' (created in the browser; the #key= fragment is only in the original link)'
      } else if (record.isPrivate) {
        note = ' (private — password required)'
      }

      lines.push(
        `- ${record.slug} · ${record.type}${record.type === 'json' ? `/${record.mode}` : ''} · ${record.isPrivate ? 'private' : 'public'} · ${record.accessType}${note}`,
        `  ${url}`
      )
    }

    return lines.join('\n')
  }
}

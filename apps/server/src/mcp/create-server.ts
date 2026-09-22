import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { McpAuthContext } from '../services/mcp-token.service'
import { McpShareError, McpShareService } from '../services/mcp-share.service'
import { getSiteUrl, parseShareReference } from './urls'
import { JSON_ROCK_ICON_DATA_URI } from './icon'
import logger from '../config/logger'

const shareTools = new McpShareService()

const typeSchema = z
  .enum(['json', 'text', 'markdown', 'html'])
  .describe(
    'json = visualizer and formatter, text = rich text HTML, markdown = Markdown with Mermaid, html = HTML preview'
  )

const modeSchema = z
  .enum(['formatter', 'visualize', 'tree'])
  .optional()
  .describe(
    'JSON view. Ignored for text, markdown, and html. Default formatter.'
  )

const accessSchema = z
  .enum(['viewer', 'editor'])
  .optional()
  .describe(
    'viewer can open the link. editor can also change it. Default viewer.'
  )

function toolError(error: unknown) {
  const message =
    error instanceof McpShareError
      ? error.message
      : error instanceof Error
        ? error.message
        : 'Something went wrong'
  if (!(error instanceof McpShareError)) {
    logger.error('MCP share tool failed', error)
  }
  return {
    isError: true as const,
    content: [{ type: 'text' as const, text: message }],
  }
}

function toolText(text: string) {
  return { content: [{ type: 'text' as const, text }] }
}

function referenceFrom(input: { slug?: string; url?: string }): {
  slug: string
  key?: string
} {
  if (input.url?.trim()) return parseShareReference(input.url)
  if (input.slug?.trim()) return parseShareReference(input.slug)
  throw new McpShareError('Pass a slug or a full share URL.')
}

export function createJsonRockMcpServer(auth: McpAuthContext): McpServer {
  const siteUrl = getSiteUrl()
  const server = new McpServer(
    {
      name: 'jsonrock',
      title: 'JSON Rock',
      version: '1.0.0',
      description:
        'Publish JSON, text, Markdown, Mermaid, and HTML as encrypted shareable links.',
      websiteUrl: siteUrl,
      icons: [
        {
          src: JSON_ROCK_ICON_DATA_URI,
          mimeType: 'image/svg+xml',
          sizes: ['any'],
        },
        {
          src: `${siteUrl}/icon.svg`,
          mimeType: 'image/svg+xml',
          sizes: ['any'],
        },
      ],
    },
    {
      instructions: [
        'JSON Rock publishes JSON, plain text, Markdown (including Mermaid diagrams), and HTML as one shareable link.',
        'Call create_share with the content. It returns a URL the user can open or forward.',
        'Public URLs include a #key= fragment. Keep that fragment. The server never stores the raw document.',
        'Pass a password to create_share when the link should be private. Recipients need both the URL and the password.',
        'Use update_share only to replace document content. Use change_share_access to switch between viewer and editor access without uploading content again.',
        'Use read_share for documents this token can decrypt. Use list_shares to see documents owned by the signed-in account.',
        'Links expire 30 days after creation.',
      ].join(' '),
    }
  )

  server.registerTool(
    'create_share',
    {
      title: 'Create a JSON Rock share link',
      description:
        'Publish JSON, text, Markdown (Mermaid supported), or HTML and return one shareable JSON Rock link. Content is encrypted before it is stored. Omit password for a public link. Pass a password of at least 4 characters for a private link.',
      inputSchema: {
        content: z
          .string()
          .min(1)
          .max(1_500_000)
          .describe('The document body to publish'),
        type: typeSchema,
        mode: modeSchema,
        access: accessSchema,
        preview_only: z
          .boolean()
          .optional()
          .describe(
            'Markdown only. When true, people who are not the owner see a read-only preview.'
          ),
        password: z
          .string()
          .min(4)
          .max(128)
          .optional()
          .describe('Set this to make the link private. Minimum 4 characters.'),
      },
      annotations: {
        title: 'Create share link',
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const text = await shareTools.createShare(auth.userId, {
          content: args.content,
          type: args.type,
          mode: args.mode,
          access: args.access,
          previewOnly: args.preview_only,
          password: args.password,
        })
        return toolText(text)
      } catch (error) {
        return toolError(error)
      }
    }
  )

  server.registerTool(
    'update_share',
    {
      title: 'Update a JSON Rock document',
      description:
        'Replace only the content of a document owned by this account. Pass slug or the full share URL. This tool does not change access or privacy settings. For a public document created in the browser, pass the full URL so the #key= fragment is available.',
      inputSchema: {
        content: z.string().min(1).max(1_500_000),
        slug: z.string().max(20).optional().describe('Document id'),
        url: z
          .string()
          .max(2000)
          .optional()
          .describe('Full share URL, including #key= when it is public'),
        password: z
          .string()
          .min(4)
          .max(128)
          .optional()
          .describe(
            'Required for a private document when this account cannot restore the key'
          ),
      },
      annotations: {
        title: 'Update share',
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const ref = referenceFrom(args)
        const text = await shareTools.updateShare(auth.userId, {
          slug: ref.slug,
          key: ref.key,
          content: args.content,
          password: args.password,
        })
        return toolText(text)
      } catch (error) {
        return toolError(error)
      }
    }
  )

  server.registerTool(
    'change_share_access',
    {
      title: 'Change JSON Rock share access',
      description:
        'Change only who can edit a document owned by this account. Use viewer for read-only access or editor to let anyone with the link edit. This tool never reads, uploads, replaces, or re-encrypts document content.',
      inputSchema: {
        slug: z.string().max(20).optional().describe('Document id'),
        url: z
          .string()
          .max(2000)
          .optional()
          .describe('Full share URL, including #key= when available'),
        access: z
          .enum(['viewer', 'editor'])
          .describe(
            'viewer = read only; editor = anyone with the link can edit'
          ),
      },
      annotations: {
        title: 'Change share access',
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const ref = referenceFrom(args)
        const text = await shareTools.changeShareAccess(auth.userId, {
          slug: ref.slug,
          key: ref.key,
          access: args.access,
        })
        return toolText(text)
      } catch (error) {
        return toolError(error)
      }
    }
  )

  server.registerTool(
    'read_share',
    {
      title: 'Read a JSON Rock document',
      description:
        'Decrypt and return a document. Pass the full public URL (with #key=) or a slug plus password for a private document. Documents created with this account can be read without the fragment when the key was stored for the owner.',
      inputSchema: {
        slug: z.string().max(20).optional(),
        url: z.string().max(2000).optional(),
        password: z.string().min(4).max(128).optional(),
      },
      annotations: {
        title: 'Read share',
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const ref = referenceFrom(args)
        const text = await shareTools.readShare(auth.userId, {
          slug: ref.slug,
          key: ref.key,
          password: args.password,
        })
        return toolText(text)
      } catch (error) {
        return toolError(error)
      }
    }
  )

  server.registerTool(
    'list_shares',
    {
      title: 'List JSON Rock documents',
      description:
        'List recent documents owned by the account that created this MCP token, with share URLs when the encryption key can be restored.',
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe('How many documents to return. Default 20.'),
      },
      annotations: {
        title: 'List shares',
        readOnlyHint: true,
      },
    },
    async (args) => {
      try {
        const text = await shareTools.listShares(auth.userId, args.limit ?? 20)
        return toolText(text)
      } catch (error) {
        return toolError(error)
      }
    }
  )

  server.registerTool(
    'whoami',
    {
      title: 'Check MCP token',
      description:
        'Confirm the MCP token is valid and return the token name. Does not return the token secret.',
      annotations: {
        title: 'Who am I',
        readOnlyHint: true,
      },
    },
    async () =>
      toolText(
        `Authenticated with MCP token "${auth.tokenName}". Use create_share to publish a document and get a link.`
      )
  )

  return server
}

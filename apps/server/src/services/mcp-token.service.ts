import { createHash, randomBytes } from 'crypto'
import McpToken, { IMcpToken } from '../models/mcp-token.model'

export const MAX_ACTIVE_MCP_TOKENS = 10

export interface McpAuthContext {
  userId: string
  tokenId: string
  tokenName: string
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export class McpTokenService {
  async createToken(
    ownerId: string,
    name: string
  ): Promise<{ record: IMcpToken; secret: string }> {
    const active = await McpToken.countDocuments({
      ownerId,
      revokedAt: null,
    })
    if (active >= MAX_ACTIVE_MCP_TOKENS) {
      throw new Error(
        `You can have at most ${MAX_ACTIVE_MCP_TOKENS} active MCP tokens. Revoke one first.`
      )
    }

    const secret = `jr_mcp_${randomBytes(32).toString('base64url')}`
    const record = await McpToken.create({
      ownerId,
      name,
      tokenHash: hashToken(secret),
      tokenPrefix: secret.slice(0, 14),
      revokedAt: null,
    })
    return { record, secret }
  }

  listTokens(ownerId: string): Promise<IMcpToken[]> {
    return McpToken.find({ ownerId, revokedAt: null }).sort({ createdAt: -1 })
  }

  async revokeToken(ownerId: string, tokenId: string): Promise<boolean> {
    const updated = await McpToken.findOneAndUpdate(
      { _id: tokenId, ownerId, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    )
    return Boolean(updated)
  }

  async authenticate(secret: string): Promise<McpAuthContext | null> {
    if (!secret.startsWith('jr_mcp_')) return null
    const record = await McpToken.findOne({
      tokenHash: hashToken(secret),
      revokedAt: null,
    })
    if (!record) return null

    void McpToken.updateOne(
      { _id: record._id },
      { $set: { lastUsedAt: new Date() } }
    ).catch(() => undefined)

    return {
      userId: record.ownerId,
      tokenId: record._id.toString(),
      tokenName: record.name,
    }
  }
}

import { Response } from 'express'
import { McpTokenService } from '../services/mcp-token.service'
import { AuthenticatedRequest } from '../middlewares/auth.middleware'
import logger from '../config/logger'
import { IMcpToken } from '../models/mcp-token.model'

function serializeToken(record: IMcpToken, secret?: string) {
  return {
    id: record._id.toString(),
    name: record.name,
    tokenPrefix: record.tokenPrefix,
    createdAt: record.createdAt,
    lastUsedAt: record.lastUsedAt || null,
    ...(secret ? { secret } : {}),
  }
}

const mcpTokenService = new McpTokenService()

export class McpTokenController {
  async createToken(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.auth?.userId
      if (!userId) {
        res.status(401).json({ error: 'Authentication required.' })
        return
      }

      const { record, secret } = await mcpTokenService.createToken(
        userId,
        req.body.name as string
      )
      res.status(201).json({ token: serializeToken(record, secret) })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to create token'
      const status = message.includes('at most') ? 400 : 500
      if (status === 500) logger.error('Error creating MCP token', error)
      res.status(status).json({ error: message })
    }
  }

  async listTokens(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.auth?.userId
      if (!userId) {
        res.status(401).json({ error: 'Authentication required.' })
        return
      }

      const records = await mcpTokenService.listTokens(userId)
      res.json({ tokens: records.map((record) => serializeToken(record)) })
    } catch (error) {
      logger.error('Error listing MCP tokens', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  async revokeToken(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.auth?.userId
      if (!userId) {
        res.status(401).json({ error: 'Authentication required.' })
        return
      }

      const revoked = await mcpTokenService.revokeToken(
        userId,
        req.params.id as string
      )
      if (!revoked) {
        res.status(404).json({ error: 'Token not found' })
        return
      }
      res.json({ success: true })
    } catch (error) {
      logger.error('Error revoking MCP token', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
}

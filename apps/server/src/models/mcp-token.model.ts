import mongoose, { Schema, Document } from 'mongoose'

export interface IMcpToken extends Document {
  ownerId: string
  name: string
  tokenHash: string
  tokenPrefix: string
  lastUsedAt?: Date | null
  revokedAt?: Date | null
  createdAt: Date
  updatedAt: Date
}

const McpTokenSchema: Schema = new Schema(
  {
    ownerId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    tokenHash: { type: String, required: true, unique: true },
    tokenPrefix: { type: String, required: true },
    lastUsedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

export default mongoose.model<IMcpToken>(
  'McpToken',
  McpTokenSchema,
  'mcp_tokens'
)

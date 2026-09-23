import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { McpTokenController } from '../controllers/mcp-token.controller'
import { requireAuth } from '../middlewares/auth.middleware'
import { validate } from '../utils/validator.utils'
import {
  createMcpTokenSchema,
  revokeMcpTokenSchema,
} from '../validators/mcp-token.validation'

const router: Router = Router()
const controller = new McpTokenController()

const tokenLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many token requests. Please slow down.' },
})

router.use(requireAuth)
router.get('/tokens', tokenLimiter, controller.listTokens)
router.post(
  '/tokens',
  tokenLimiter,
  validate(createMcpTokenSchema),
  controller.createToken
)
router.delete(
  '/tokens/:id',
  tokenLimiter,
  validate(revokeMcpTokenSchema),
  controller.revokeToken
)

export default router

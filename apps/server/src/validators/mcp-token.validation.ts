import Joi from 'joi'

export const createMcpTokenSchema = {
  body: Joi.object({
    name: Joi.string().trim().min(1).max(40).required().messages({
      'string.max': 'Token name must be 40 characters or fewer',
      'any.required': 'Token name is required',
    }),
  }),
}

export const revokeMcpTokenSchema = {
  params: Joi.object({
    id: Joi.string().hex().length(24).required().messages({
      'string.length': 'Invalid token id',
    }),
  }),
}

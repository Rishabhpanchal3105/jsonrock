import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  pbkdf2Sync,
  randomBytes,
} from 'crypto'

const PBKDF2_ITERATIONS = 100_000
const OWNER_WRAP_SALT = Buffer.from('jsonrock-owner-wrap-v1', 'utf8')

export interface EncryptedPayload {
  ciphertext: string
  iv: string
}

function encryptBuffer(data: Buffer, key: Buffer): EncryptedPayload {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    ciphertext: Buffer.concat([encrypted, tag]).toString('base64'),
    iv: iv.toString('base64'),
  }
}

function decryptBuffer(
  ciphertextBase64: string,
  ivBase64: string,
  key: Buffer
): Buffer {
  const payload = Buffer.from(ciphertextBase64, 'base64')
  if (payload.length < 16) {
    throw new Error('Ciphertext is too short')
  }
  const iv = Buffer.from(ivBase64, 'base64')
  const tag = payload.subarray(payload.length - 16)
  const data = payload.subarray(0, payload.length - 16)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()])
}

/** Random 256-bit content key. `keyString` matches the website `#key=` fragment. */
export function generateContentKey(): { key: Buffer; keyString: string } {
  const key = randomBytes(32)
  return { key, keyString: key.toString('base64url') }
}

export function contentKeyFromFragment(keyString: string): Buffer {
  const key = Buffer.from(keyString, 'base64url')
  if (key.length !== 32) {
    throw new Error('Document key must be 32 bytes')
  }
  return key
}

export function generateSalt(): string {
  return randomBytes(16).toString('base64')
}

/** Matches the website PBKDF2-SHA256 derivation (100,000 iterations). */
export function deriveKeyFromPassword(
  password: string,
  saltBase64: string
): Buffer {
  const salt = Buffer.from(saltBase64, 'base64')
  return pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, 'sha256')
}

function deriveWrappingKey(secretBase64: string): Buffer {
  const ikm = Buffer.from(secretBase64, 'base64')
  return Buffer.from(
    hkdfSync('sha256', ikm, OWNER_WRAP_SALT, Buffer.alloc(0), 32)
  )
}

export function encryptContent(
  plaintext: string,
  key: Buffer
): EncryptedPayload {
  return encryptBuffer(Buffer.from(plaintext, 'utf8'), key)
}

export function decryptContent(
  ciphertextBase64: string,
  ivBase64: string,
  key: Buffer
): string {
  if (!ciphertextBase64) return ''
  return decryptBuffer(ciphertextBase64, ivBase64, key).toString('utf8')
}

/** Wraps a raw content key the same way the browser `wrapContentKey` helper does. */
export function wrapContentKey(
  contentKey: Buffer,
  secretBase64: string
): string {
  const { ciphertext, iv } = encryptBuffer(
    contentKey,
    deriveWrappingKey(secretBase64)
  )
  return JSON.stringify({ ciphertext, iv })
}

export function unwrapContentKey(
  wrapped: string,
  secretBase64: string
): Buffer {
  const parsed = JSON.parse(wrapped) as { ciphertext?: string; iv?: string }
  if (!parsed.ciphertext || !parsed.iv) {
    throw new Error('Invalid wrapped content key')
  }
  const raw = decryptBuffer(
    parsed.ciphertext,
    parsed.iv,
    deriveWrappingKey(secretBase64)
  )
  if (raw.length !== 32) {
    throw new Error('Unwrapped content key has an unexpected length')
  }
  return raw
}

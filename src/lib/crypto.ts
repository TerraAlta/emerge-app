import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key) throw new Error('ENCRYPTION_KEY env var required')
  return Buffer.from(key, 'hex')
}

/** Encrypt a plaintext string. Returns hex-encoded: iv + authTag + ciphertext */
export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  // Pack: iv (16) + authTag (16) + ciphertext
  return Buffer.concat([iv, authTag, encrypted]).toString('hex')
}

/** Decrypt a hex-encoded string produced by encrypt() */
export function decrypt(packed: string): string {
  const key = getKey()
  const buf = Buffer.from(packed, 'hex')
  const iv = buf.subarray(0, IV_LENGTH)
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  return decipher.update(ciphertext) + decipher.final('utf8')
}

/** Check if a string looks like it was encrypted (hex, correct min length) */
export function isEncrypted(value: string): boolean {
  // Minimum: 16 iv + 16 authTag + 1 char encrypted = 66 hex chars
  return /^[0-9a-f]{66,}$/i.test(value)
}

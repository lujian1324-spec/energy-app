// At-rest encryption for stored user refresh tokens.
// AES-256-GCM with a key from env TOKEN_ENC_KEY (64 hex chars = 32 bytes).
// If no key is configured we fall back to storing plaintext and warn loudly —
// the relay still works, but you MUST set TOKEN_ENC_KEY in any real deployment.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const RAW = process.env.TOKEN_ENC_KEY || ''
let KEY = null
if (RAW) {
  try {
    const buf = Buffer.from(RAW, 'hex')
    if (buf.length !== 32) throw new Error(`expected 32 bytes, got ${buf.length}`)
    KEY = buf
  } catch (e) {
    console.warn('[crypto] invalid TOKEN_ENC_KEY (need 64 hex chars):', e.message, '— storing tokens in PLAINTEXT')
  }
} else {
  console.warn('[crypto] TOKEN_ENC_KEY not set — refresh tokens will be stored in PLAINTEXT. Set it before any real deployment.')
}

/** Encrypt a UTF-8 string → "enc:v1:<iv_hex>:<tag_hex>:<cipher_hex>" (or "plain:<text>" when no key). */
export function encryptToken(plaintext) {
  if (plaintext == null) return plaintext
  if (!KEY) return 'plain:' + plaintext
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', KEY, iv)
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `enc:v1:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`
}

/** Decrypt a value produced by encryptToken(). Returns null if it can't be read. */
export function decryptToken(stored) {
  if (stored == null) return null
  const s = String(stored)
  if (s.startsWith('plain:')) return s.slice(6)
  if (!s.startsWith('enc:v1:')) return s // legacy raw value
  if (!KEY) { console.warn('[crypto] cannot decrypt: TOKEN_ENC_KEY not set'); return null }
  try {
    const [, , ivHex, tagHex, dataHex] = s.split(':')
    const decipher = createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8')
  } catch (e) {
    console.warn('[crypto] decrypt failed:', e.message)
    return null
  }
}

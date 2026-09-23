import { createHmac, timingSafeEqual } from 'node:crypto'

export const TICK_PATH = '/internal/sleep/tick'
export function signTick(secret, timestamp, nonce, body) {
  return createHmac('sha256', secret).update(`POST\n${TICK_PATH}\n${timestamp}\n${nonce}\n${body}`).digest('hex')
}

export function createTickVerifier(secret, clock = Date.now) {
  const used = new Map()
  return (headers, body) => {
    if (typeof secret !== 'string' || secret.trim().length < 32) return false
    const time = headers['x-sleep-timestamp'], nonce = headers['x-sleep-nonce'], signature = headers['x-sleep-signature']
    const now = clock()
    if (typeof time !== 'string' || !/^\d{13}$/.test(time) || Math.abs(now - Number(time)) > 120000) return false
    if (typeof nonce !== 'string' || !/^[a-f0-9]{32}$/.test(nonce)) return false
    if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature)) return false
    for (const [key, expires] of used) if (expires < now) used.delete(key)
    if (used.has(nonce)) return false
    const expected = signTick(secret, time, nonce, body)
    if (!timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))) return false
    used.set(nonce, Number(time) + 120000)
    return true
  }
}

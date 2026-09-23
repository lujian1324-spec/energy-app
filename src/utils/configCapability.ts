/**
 * SW-12 — remembered per-model config capability.
 *
 * SW-11 decides "this product model has no `sleepMode` attribute" from the
 * cloud's English wording, because the code it answers with is the generic
 * illegal-argument one and cannot tell a missing key from a refusal. A string
 * matcher is the wrong thing to lean on twice: the first time it is all we
 * have, but the answer is a fact about the *model*, so it is worth keeping.
 *
 * Once a model has told us a key does not exist, that is the capability signal
 * every later save consults first — the wording only has to be recognised once,
 * and a deployment that rephrases the message keeps behaving the same way for
 * anyone who has saved before.
 *
 * It only ever records "missing", never "present": a key that works needs no
 * memo, and not remembering success means a model that later gains the
 * attribute simply starts working again.
 */

const KEY_PREFIX = 'sierro-config-missing'

function memoKey(model: string, attribute: string): string {
  return `${KEY_PREFIX}-${String(model || 'unknown').trim().toLowerCase()}-${attribute}`
}

/** Has this model already told us it has no such config attribute? */
export function isKnownMissingConfigAttribute(model: string, attribute: string): boolean {
  try {
    return localStorage.getItem(memoKey(model, attribute)) === '1'
  } catch {
    return false
  }
}

/** Record that this model has no such config attribute. */
export function rememberMissingConfigAttribute(model: string, attribute: string): void {
  try {
    localStorage.setItem(memoKey(model, attribute), '1')
  } catch {
    // ignore storage errors — the string matcher still covers this run
  }
}

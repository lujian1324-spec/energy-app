const pending = new Map()

// A refresh rotates BOTH tokens. Saves, refreshes and power writes for one user
// must share this lock and re-read the store after acquiring it.
export async function withUserLock(userId, work, { deadline = Infinity } = {}) {
  const key = String(userId)
  const previous = pending.get(key) || Promise.resolve()
  const current = previous.catch(() => {}).then(() => {
    if (Date.now() >= deadline) throw new Error('USER_LOCK_DEADLINE')
    return work()
  })
  pending.set(key, current)
  let timer
  const timeout = Number.isFinite(deadline) ? new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('USER_LOCK_DEADLINE')), Math.max(0, deadline - Date.now()))
  }) : null
  try { return await (timeout ? Promise.race([current, timeout]) : current) }
  // Keep the queue intact after a wait timeout. The queued job checks the same
  // deadline before starting and therefore cannot write after the caller left.
  finally {
    clearTimeout(timer)
    current.finally(() => { if (pending.get(key) === current) pending.delete(key) }).catch(() => {})
  }
}

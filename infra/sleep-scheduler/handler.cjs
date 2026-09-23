const { createHmac, randomBytes } = require('node:crypto')

// Inject the secret reader in tests. Production's SDK client is reused between
// invocations; device credentials never enter this Lambda or its event payload.
exports.createHandler = ({ readSecret, request = fetch, clock = Date.now,
  nonce = () => randomBytes(16).toString('hex'), relayUrl }) => async (event = {}) => {
  const url = new URL('/internal/sleep/tick', relayUrl)
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('HTTPS relay required')
  const secret = await readSecret()
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('Invalid signing secret')
  const body = JSON.stringify({ dryRun: event.dryRun === true })
  const timestamp = String(clock()), id = nonce()
  const signature = createHmac('sha256', secret)
    .update(`POST\n${url.pathname}\n${timestamp}\n${id}\n${body}`).digest('hex')
  const response = await request(url, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(45000), body,
    headers: { 'Content-Type': 'application/json', 'X-Sleep-Timestamp': timestamp,
      'X-Sleep-Nonce': id, 'X-Sleep-Signature': signature },
  })
  const result = await response.json()
  // Never log raw responses: an upstream proxy might echo a credential.
  if (!response.ok || result.code !== 0 || !result.data || result.data.failed || result.data.deferred) {
    throw new Error(`Sleep tick not acknowledged (HTTP ${response.status})`)
  }
  const counts = Object.fromEntries(['checked', 'applied', 'unchanged', 'failed', 'deferred']
    .map(key => [key, Number(result.data[key]) || 0]))
  console.log(JSON.stringify({ event: 'sleep-tick', dryRun: event.dryRun === true, ...counts }))
  return { ok: true, dryRun: event.dryRun === true, ...counts }
}

let handler
exports.handler = async event => {
  if (!handler) {
    const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager')
    const secrets = new SecretsManagerClient({ maxAttempts: 2 })
    handler = exports.createHandler({ relayUrl: process.env.RELAY_URL,
      readSecret: async () => (await secrets.send(new GetSecretValueCommand({ SecretId: process.env.SECRET_ARN }))).SecretString,
    })
  }
  return handler(event)
}

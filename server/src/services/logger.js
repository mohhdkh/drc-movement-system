const SENSITIVE_KEY = /authorization|cookie|password|secret|token|database_?url|connectionstring|clientsecret/i
const CONNECTION_URL = /(?:postgres(?:ql)?):\/\/[^\s]+/gi
const JWT_VALUE = /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*\b/g

function redactString(value) {
  let result = value.replace(CONNECTION_URL, '[REDACTED_DATABASE_URL]')
  result = result.replace(JWT_VALUE, '[REDACTED_JWT]')
  for (const name of ['DATABASE_URL', 'PGPASSWORD', 'MS_CLIENT_SECRET', 'REVIEW_ACCESS_PASSWORD']) {
    const secret = process.env[name]
    if (secret && secret.length >= 4) result = result.split(secret).join('[REDACTED]')
  }
  return result
}

function redact(value, key = '', seen = new WeakSet()) {
  if (SENSITIVE_KEY.test(key)) return '[REDACTED]'
  if (typeof value === 'string') return redactString(value)
  if (!value || typeof value !== 'object') return value
  if (seen.has(value)) return '[CIRCULAR]'
  seen.add(value)
  if (Array.isArray(value)) return value.map((item) => redact(item, '', seen))
  return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [
    childKey,
    redact(child, childKey, seen),
  ]))
}

function createLogger({ sink = (line) => process.stdout.write(`${line}\n`), clock = () => new Date() } = {}) {
  function write(severity, event, fields = {}) {
    const record = redact({ timestamp: clock().toISOString(), severity, event, ...fields })
    sink(JSON.stringify(record))
    return record
  }
  return {
    debug: (event, fields) => write('debug', event, fields),
    info: (event, fields) => write('info', event, fields),
    warn: (event, fields) => write('warn', event, fields),
    error: (event, fields) => write('error', event, fields),
  }
}

const logger = createLogger()

module.exports = { createLogger, logger, redact }

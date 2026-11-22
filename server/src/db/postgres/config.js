const path = require('path')
const dotenv = require('dotenv')

dotenv.config({ path: path.resolve(__dirname, '../../../.env'), quiet: true })

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'require', 'required'])
const FALSE_VALUES = new Set(['0', 'false', 'no', 'disable', 'disabled'])

function positiveInteger(value, fallback, name) {
  if (value === undefined || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`)
  }
  return parsed
}

function parseSsl(value = process.env.PGSSL, { defaultEnabled = false, isProduction = false } = {}) {
  if (value === undefined || value === '') return defaultEnabled ? { rejectUnauthorized: true } : false
  const normalized = String(value).toLowerCase()
  if (FALSE_VALUES.has(normalized)) return false
  if (TRUE_VALUES.has(normalized)) return { rejectUnauthorized: true }
  if (normalized === 'no-verify' || normalized === 'allow-self-signed') {
    if (isProduction) throw new Error('PGSSL=no-verify is not allowed in production.')
    return { rejectUnauthorized: false }
  }
  throw new Error('PGSSL must be true, false, require, or no-verify.')
}

function getPostgresConfig(env = process.env) {
  let connectionString = env.DATABASE_URL || undefined
  let urlSslMode = ''
  let urlChannelBinding = ''
  if (connectionString) {
    let parsed
    try { parsed = new URL(connectionString) } catch { throw new Error('DATABASE_URL must be a valid PostgreSQL URL.') }
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
      throw new Error('DATABASE_URL must use the postgres or postgresql protocol.')
    }
    urlSslMode = (parsed.searchParams.get('sslmode') || '').toLowerCase()
    urlChannelBinding = (parsed.searchParams.get('channel_binding') || '').toLowerCase()
    for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat', 'channel_binding']) {
      parsed.searchParams.delete(key)
    }
    connectionString = parsed.toString()
  }
  const hasDiscreteConfig = Boolean(env.PGHOST || env.PGDATABASE || env.PGUSER)
  if (!connectionString && !hasDiscreteConfig) {
    throw new Error('PostgreSQL requires DATABASE_URL or PGHOST/PGDATABASE/PGUSER configuration.')
  }
  if (!connectionString) {
    const missing = ['PGHOST', 'PGDATABASE', 'PGUSER'].filter((name) => !env[name])
    if (missing.length) throw new Error(`PostgreSQL configuration is missing ${missing.join(', ')}.`)
  }

  const sslDefault = Boolean(connectionString) && urlSslMode !== 'disable'
  const ssl = parseSsl(env.PGSSL, {
    defaultEnabled: sslDefault,
    isProduction: env.NODE_ENV === 'production',
  })
  const enableChannelBinding = ['require', 'required', 'true', '1'].includes(
    String(env.PGCHANNELBINDING || urlChannelBinding).toLowerCase(),
  )

  return {
    ...(connectionString ? { connectionString } : {
      host: env.PGHOST,
      port: positiveInteger(env.PGPORT, 5432, 'PGPORT'),
      database: env.PGDATABASE,
      user: env.PGUSER,
      password: env.PGPASSWORD,
    }),
    ssl,
    enableChannelBinding,
    application_name: 'drc-movement-system',
    max: positiveInteger(env.PGPOOL_MAX, 10, 'PGPOOL_MAX'),
    connectionTimeoutMillis: positiveInteger(env.PGCONNECT_TIMEOUT_MS, 5000, 'PGCONNECT_TIMEOUT_MS'),
    idleTimeoutMillis: positiveInteger(env.PGIDLE_TIMEOUT_MS, 30000, 'PGIDLE_TIMEOUT_MS'),
    maxLifetimeSeconds: positiveInteger(env.PGPOOL_MAX_LIFETIME_SECONDS, 300, 'PGPOOL_MAX_LIFETIME_SECONDS'),
    keepAlive: true,
    keepAliveInitialDelayMillis: positiveInteger(env.PGKEEPALIVE_DELAY_MS, 10000, 'PGKEEPALIVE_DELAY_MS'),
    query_timeout: positiveInteger(env.PGQUERY_TIMEOUT_MS, 10000, 'PGQUERY_TIMEOUT_MS'),
    statement_timeout: positiveInteger(env.PGSTATEMENT_TIMEOUT_MS, 10000, 'PGSTATEMENT_TIMEOUT_MS'),
    idle_in_transaction_session_timeout: positiveInteger(
      env.PGTRANSACTION_IDLE_TIMEOUT_MS,
      10000,
      'PGTRANSACTION_IDLE_TIMEOUT_MS',
    ),
    lock_timeout: positiveInteger(env.PGLOCK_TIMEOUT_MS, 5000, 'PGLOCK_TIMEOUT_MS'),
  }
}

module.exports = { getPostgresConfig, parseSsl }

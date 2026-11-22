const assert = require('node:assert/strict')
const { after, before, test } = require('node:test')
const express = require('express')
const { buildRuntimeConfig, validateProductionConfiguration } = require('../src/config/env')
const { createApp } = require('../src/app')
const { getOperationalProvider, setOperationalProviderForTests } = require('../src/db/operationalDatabase')
const { getPostgresConfig, parseSsl } = require('../src/db/postgres/config')
const { isTransientPostgresError, validatePostgresConnection } = require('../src/db/postgres/pool')
const { createLogger, redact } = require('../src/services/logger')
const { errorHandler } = require('../src/middleware/errorHandler')
const { gracefulShutdown } = require('../src/serverLifecycle')

const baseConfig = buildRuntimeConfig({
  NODE_ENV: 'test',
  CLIENT_ORIGIN: 'http://localhost:5173',
  DATABASE_PROVIDER: 'sqlite',
}, { isTestProcess: true })

let server
let baseUrl

before(async () => {
  server = createApp({ ...baseConfig, logRequests: false }).listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(() => new Promise((resolve, reject) => {
  server.close((error) => error ? reject(error) : resolve())
}))

test('production configuration is explicit, PostgreSQL-only, HTTPS-only, and TLS-verified', () => {
  assert.throws(() => validateProductionConfiguration(buildRuntimeConfig({
    NODE_ENV: 'production', CLIENT_ORIGIN: 'https://movement.example.org', DATABASE_PROVIDER: 'postgres',
  }, { isTestProcess: false }), {}), /Production configuration is missing/)

  const environment = {
    NODE_ENV: 'production', PORT: '5000', CLIENT_ORIGIN: 'https://movement.example.org',
    DATABASE_PROVIDER: 'postgres', DATABASE_URL: 'postgresql://user:example@db.example.org/app?sslmode=require',
    MOVEMENT_TIMEZONE: 'Asia/Gaza', MOVEMENT_CUTOFF_HOUR: '12',
    AUTH_PROVIDER: 'entra',
    ENTRA_TENANT_ID: '11111111-1111-4111-8111-111111111111',
    ENTRA_CLIENT_ID: '22222222-2222-4222-8222-222222222222',
    ENTRA_AUDIENCE: 'api://drc-movement',
    ENTRA_ISSUER: 'https://login.microsoftonline.com/11111111-1111-4111-8111-111111111111/v2.0',
    ENTRA_ALLOWED_TENANT_ID: '11111111-1111-4111-8111-111111111111',
  }
  const config = buildRuntimeConfig(environment, { isTestProcess: false })
  assert.equal(validateProductionConfiguration(config, environment), config)
  assert.equal(config.authProvider, 'entra')
  assert.throws(() => validateProductionConfiguration(config, {
    ...environment, DATABASE_URL: 'postgresql://user:example@db.example.org/app?sslmode=disable',
  }), /certificate-verified TLS/)
})

test('PostgreSQL URL TLS parameters are normalized without weakening verification', () => {
  const config = getPostgresConfig({
    DATABASE_URL: 'postgresql://user:example@db.example.org/app?sslmode=require&channel_binding=require',
  })
  assert.equal(config.connectionString.includes('sslmode'), false)
  assert.equal(config.connectionString.includes('channel_binding'), false)
  assert.deepEqual(config.ssl, { rejectUnauthorized: true })
  assert.equal(config.enableChannelBinding, true)
  assert.throws(() => parseSsl('no-verify', { isProduction: true }), /not allowed/)
})

test('PostgreSQL startup retry is bounded and only retries transient failures', async () => {
  assert.equal(isTransientPostgresError(new Error('Connection terminated due to connection timeout')), true)
  assert.equal(isTransientPostgresError(Object.assign(new Error('authentication failed'), { code: '28P01' })), false)
  let attempts = 0
  const transientPool = { query: async () => {
    attempts += 1
    if (attempts < 3) throw Object.assign(new Error('temporary'), { code: 'ECONNRESET' })
    return { rows: [{ server_time: '2026-09-05T00:00:00.000Z' }] }
  } }
  const result = await validatePostgresConnection(transientPool, { attempts: 3, sleep: async () => {} })
  assert.equal(result.connected, true)
  assert.equal(attempts, 3)

  attempts = 0
  await assert.rejects(() => validatePostgresConnection({ query: async () => {
    attempts += 1
    throw Object.assign(new Error('authentication failed'), { code: '28P01' })
  } }, { attempts: 3, sleep: async () => {} }), /startup validation failed/)
  assert.equal(attempts, 1)
})

test('structured logging redacts credentials, authorization, cookies, and database URLs', () => {
  const lines = []
  const logger = createLogger({ sink: (line) => lines.push(line), clock: () => new Date('2026-09-05T00:00:00Z') })
  logger.error('test', {
    authorization: 'Bearer example-token', cookie: 'session=example', password: 'example-password',
    message: 'failed postgresql://user:example-password@db.example.org/app',
    detail: 'token eyJhbGciOiJSUzI1NiJ9.cGF5bG9hZA.c2lnbmF0dXJl rejected',
  })
  assert.equal(lines.length, 1)
  assert.equal(lines[0].includes('example-token'), false)
  assert.equal(lines[0].includes('example-password'), false)
  assert.equal(lines[0].includes('postgresql://'), false)
  assert.equal(lines[0].includes('eyJhbGci'), false)
  assert.equal(redact({ clientSecret: 'hidden' }).clientSecret, '[REDACTED]')
})

test('HTTP hardening sets security headers, correlation IDs, and strict CORS', async () => {
  const requestId = 'request-12345678'
  const allowed = await fetch(`${baseUrl}/api/health/live`, {
    headers: { Origin: 'http://localhost:5173', 'X-Request-ID': requestId },
  })
  assert.equal(allowed.status, 200)
  assert.equal(allowed.headers.get('x-request-id'), requestId)
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5173')
  assert.equal(allowed.headers.has('x-powered-by'), false)
  assert.ok(allowed.headers.get('x-content-type-options'))
  assert.ok(allowed.headers.get('content-security-policy'))

  const invalidRequestId = await fetch(`${baseUrl}/api/health/live`, {
    headers: { 'X-Request-ID': 'bad' },
  })
  assert.notEqual(invalidRequestId.headers.get('x-request-id'), 'bad')
  assert.match(invalidRequestId.headers.get('x-request-id'), /^[0-9a-f-]{36}$/)

  const denied = await fetch(`${baseUrl}/api/health/live`, { headers: { Origin: 'https://denied.example.org' } })
  const payload = await denied.json()
  assert.equal(denied.status, 403)
  assert.equal(payload.code, 'CORS_ORIGIN_DENIED')
  assert.match(payload.requestId, /^[0-9a-f-]{36}$/)
})

test('HTTP hardening rejects invalid JSON and unsupported mutation content types with stable errors', async () => {
  const invalid = await fetch(`${baseUrl}/api/movements`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken',
  })
  const invalidPayload = await invalid.json()
  assert.equal(invalid.status, 400)
  assert.equal(invalidPayload.code, 'INVALID_JSON')
  assert.equal('stack' in invalidPayload, false)
  assert.ok(invalidPayload.requestId)

  const unsupported = await fetch(`${baseUrl}/api/movements`, {
    method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'example',
  })
  assert.equal(unsupported.status, 415)
  assert.equal((await unsupported.json()).code, 'UNSUPPORTED_MEDIA_TYPE')
})

test('production error responses hide stack traces, SQL details, and secret values', async () => {
  const miniApp = express()
  miniApp.use((request, _response, next) => { request.id = 'request-production-error'; next() })
  miniApp.get('/failure', () => {
    const error = new Error('SELECT secret FROM table using postgresql://user:example-password@db.example.org/app')
    error.stack = 'STACK_WITH_PRIVATE_DETAIL'
    throw error
  })
  miniApp.use(errorHandler)
  const miniServer = miniApp.listen(0, '127.0.0.1')
  await new Promise((resolve) => miniServer.once('listening', resolve))
  const previous = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  try {
    const response = await fetch(`http://127.0.0.1:${miniServer.address().port}/failure`)
    const body = JSON.stringify(await response.json())
    assert.equal(response.status, 500)
    assert.equal(body.includes('example-password'), false)
    assert.equal(body.includes('SELECT'), false)
    assert.equal(body.includes('STACK_WITH_PRIVATE_DETAIL'), false)
    assert.match(body, /INTERNAL_ERROR/)
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previous
    await new Promise((resolve) => miniServer.close(resolve))
  }
})

test('liveness is database-independent and readiness reflects database migration state', async () => {
  const original = getOperationalProvider()
  try {
    setOperationalProviderForTests({
      name: 'postgres',
      status: async () => ({ provider: 'postgres', connected: false, migrationStatus: 'unknown' }),
    })
    assert.equal((await fetch(`${baseUrl}/api/health/live`)).status, 200)
    const unavailable = await fetch(`${baseUrl}/api/health/ready`)
    assert.equal(unavailable.status, 503)
    assert.equal((await unavailable.json()).status, 'not-ready')

    setOperationalProviderForTests({
      name: 'postgres',
      status: async () => ({ provider: 'postgres', connected: true, migrationStatus: 'pending' }),
    })
    const pending = await fetch(`${baseUrl}/api/health/ready`)
    assert.equal(pending.status, 503)
    assert.equal((await pending.json()).checks.database.migrationStatus, 'pending')

    setOperationalProviderForTests({
      name: 'postgres',
      status: async () => ({ provider: 'postgres', connected: true, migrationStatus: 'up-to-date' }),
    })
    const ready = await fetch(`${baseUrl}/api/health/ready`)
    const payload = await ready.json()
    assert.equal(ready.status, 200)
    assert.equal(payload.status, 'ready')
    assert.equal(payload.checks.sharePoint.status, 'disabled')
  } finally {
    setOperationalProviderForTests(original)
  }
})

test('production rate limiting returns a stable 429 and excludes health probes', async () => {
  const limitedServer = createApp({
    ...baseConfig, rateLimitEnabled: true, rateLimitMax: 1, rateLimitWindowMs: 60000,
  }).listen(0, '127.0.0.1')
  await new Promise((resolve) => limitedServer.once('listening', resolve))
  const limitedBase = `http://127.0.0.1:${limitedServer.address().port}`
  try {
    assert.equal((await fetch(`${limitedBase}/api/missing`)).status, 404)
    const blocked = await fetch(`${limitedBase}/api/missing`)
    assert.equal(blocked.status, 429)
    assert.equal((await blocked.json()).code, 'RATE_LIMITED')
    assert.equal((await fetch(`${limitedBase}/api/health/live`)).status, 200)
  } finally {
    await new Promise((resolve) => limitedServer.close(resolve))
  }
})

test('graceful shutdown drains HTTP before closing resources', async () => {
  const calls = []
  const fakeServer = { close(callback) { calls.push('http'); callback() } }
  const logger = { info() {}, error() {} }
  const clean = await gracefulShutdown({
    server: fakeServer,
    closeResources: async () => calls.push('resources'),
    timeoutMs: 100,
    signal: 'SIGTERM',
    logger,
  })
  assert.equal(clean, true)
  assert.deepEqual(calls, ['http', 'resources'])
})

test('graceful shutdown enforces its deadline and still closes resources', async () => {
  const calls = []
  const fakeServer = {
    close() { calls.push('http') },
    closeAllConnections() { calls.push('forced-http') },
  }
  const logger = { info() {}, error() {} }
  const clean = await gracefulShutdown({
    server: fakeServer,
    closeResources: async () => calls.push('resources'),
    timeoutMs: 10,
    signal: 'SIGTERM',
    logger,
  })
  assert.equal(clean, false)
  assert.deepEqual(calls, ['http', 'forced-http', 'resources'])
})

test('graceful shutdown does not wait indefinitely for stuck resource cleanup', async () => {
  const calls = []
  const fakeServer = {
    close(callback) { calls.push('http'); callback() },
    closeAllConnections() { calls.push('forced-http') },
  }
  const logger = { info() {}, error() {} }
  const clean = await gracefulShutdown({
    server: fakeServer,
    closeResources: () => { calls.push('resources'); return new Promise(() => {}) },
    timeoutMs: 10,
    signal: 'SIGTERM',
    logger,
  })
  assert.equal(clean, false)
  assert.deepEqual(calls, ['http', 'resources', 'forced-http'])
})

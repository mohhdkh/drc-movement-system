const assert = require('node:assert/strict')
const { afterEach, before, test } = require('node:test')
const express = require('express')
const { extractBearerToken } = require('../src/middleware/authenticate')
const { authenticate } = require('../src/middleware/authenticate')
const { errorHandler } = require('../src/middleware/errorHandler')
const { getCurrentUser } = require('../src/controllers/authController')
const { EntraTokenVerifier, fetchJsonWithRetry } = require('../src/services/entraTokenVerifier')
const { matchEntraIdentity, resolveEntraUser } = require('../src/services/entraUserService')
const { requireRole } = require('../src/services/roleService')
const { resetAuditEntries, listAuditEntries } = require('../src/data/adminAuditLog')
const { resetUsers, users } = require('../src/data/users')

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const OBJECT_ID = '22222222-2222-4222-8222-222222222222'
const OTHER_TENANT_ID = '33333333-3333-4333-8333-333333333333'
const ISSUER = `https://login.microsoftonline.com/${TENANT_ID}/v2.0`
const AUDIENCE = 'api://drc-movement'
const NOW = Date.parse('2030-01-01T00:00:00.000Z')

const config = {
  tenantId: TENANT_ID,
  allowedTenantId: TENANT_ID,
  clientId: '44444444-4444-4444-8444-444444444444',
  audience: AUDIENCE,
  issuer: ISSUER,
  metadataUrl: `${ISSUER}/.well-known/openid-configuration`,
  networkTimeoutMs: 100,
  networkRetries: 2,
  jwksCacheMs: 600000,
  jwksRefreshCooldownMs: 30000,
}

let privateKey1
let privateKey2
let jwk1
let jwk2

before(async () => {
  const { exportJWK, generateKeyPair } = await import('jose')
  const pair1 = await generateKeyPair('RS256', { extractable: true })
  const pair2 = await generateKeyPair('RS256', { extractable: true })
  privateKey1 = pair1.privateKey
  privateKey2 = pair2.privateKey
  jwk1 = { ...(await exportJWK(pair1.publicKey)), kid: 'key-1', use: 'sig', alg: 'RS256' }
  jwk2 = { ...(await exportJWK(pair2.publicKey)), kid: 'key-2', use: 'sig', alg: 'RS256' }
})

afterEach(() => {
  resetAuditEntries()
  resetUsers()
})

async function token(overrides = {}, { key = privateKey1, kid = 'key-1' } = {}) {
  const { SignJWT } = await import('jose')
  const nowSeconds = Math.floor(NOW / 1000)
  return new SignJWT({
    oid: OBJECT_ID,
    tid: TENANT_ID,
    preferred_username: 'user@drc.example',
    name: 'DRC User',
    ...overrides,
  })
    .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
    .setIssuer(overrides.iss || ISSUER)
    .setAudience(overrides.aud || AUDIENCE)
    .setIssuedAt(overrides.iat ?? nowSeconds)
    .setNotBefore(overrides.nbf ?? nowSeconds - 5)
    .setExpirationTime(overrides.exp ?? nowSeconds + 300)
    .sign(key)
}

function verifier(keys = [jwk1]) {
  return new EntraTokenVerifier({ config, loadJwks: async () => ({ keys }), now: () => NOW })
}

test('accepts a valid cryptographically signed Entra access token', async () => {
  const identity = await verifier().verify(await token())
  assert.deepEqual(identity, {
    objectId: OBJECT_ID,
    tenantId: TENANT_ID,
    principalName: 'user@drc.example',
    displayName: 'DRC User',
  })
})

test('rejects expired and not-yet-valid tokens', async () => {
  const nowSeconds = Math.floor(NOW / 1000)
  await assert.rejects(async () => verifier().verify(await token({ exp: nowSeconds - 60 })), { code: 'AUTH_TOKEN_INVALID' })
  await assert.rejects(async () => verifier().verify(await token({ nbf: nowSeconds + 60 })), { code: 'AUTH_TOKEN_INVALID' })
})

test('rejects wrong issuer, audience, and tenant', async () => {
  await assert.rejects(async () => verifier().verify(await token({ iss: 'https://issuer.invalid/v2.0' })), { code: 'AUTH_TOKEN_INVALID' })
  await assert.rejects(async () => verifier().verify(await token({ aud: 'api://another-api' })), { code: 'AUTH_TOKEN_INVALID' })
  await assert.rejects(async () => verifier().verify(await token({ tid: OTHER_TENANT_ID })), { code: 'AUTH_TOKEN_INVALID' })
})

test('rejects malformed, unsigned, and incorrectly signed tokens', async () => {
  await assert.rejects(() => verifier().verify('not-a-jwt-token-value'), { code: 'AUTH_TOKEN_INVALID' })
  const unsigned = [
    Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url'),
    Buffer.from(JSON.stringify({ oid: OBJECT_ID, tid: TENANT_ID })).toString('base64url'),
    '',
  ].join('.')
  await assert.rejects(() => verifier().verify(unsigned), { code: 'AUTH_TOKEN_INVALID' })
  await assert.rejects(
    async () => verifier().verify(await token({}, { key: privateKey2, kid: 'key-1' })),
    { code: 'AUTH_TOKEN_INVALID' },
  )
})

test('refreshes cached JWKS once when Microsoft rotates to an unknown signing key', async () => {
  let loads = 0
  const rotatingVerifier = new EntraTokenVerifier({
    config,
    now: () => NOW,
    loadJwks: async () => ({ keys: ++loads === 1 ? [jwk1] : [jwk1, jwk2] }),
  })
  await rotatingVerifier.verify(await token())
  const identity = await rotatingVerifier.verify(await token({}, { key: privateKey2, kid: 'key-2' }))
  assert.equal(identity.objectId, OBJECT_ID)
  assert.equal(loads, 2)
})

test('metadata requests use bounded retry for transient responses', async () => {
  let attempts = 0
  const value = await fetchJsonWithRetry('https://login.microsoftonline.com/example', {
    attempts: 2,
    timeoutMs: 50,
    sleep: async () => {},
    fetchImpl: async () => {
      attempts += 1
      return new Response(attempts === 1 ? '{}' : '{"keys":[]}', {
        status: attempts === 1 ? 503 : 200,
        headers: { 'content-type': 'application/json' },
      })
    },
  })
  assert.deepEqual(value, { keys: [] })
  assert.equal(attempts, 2)
})

test('requires a strict bearer Authorization header', () => {
  const request = { get: () => '' }
  assert.throws(() => extractBearerToken(request), { code: 'AUTH_REQUIRED' })
  assert.equal(extractBearerToken({ get: () => 'Bearer signed.jwt.value' }), 'signed.jwt.value')
  assert.throws(() => extractBearerToken({ get: () => 'Basic value' }), { code: 'AUTH_REQUIRED' })
})

test('denies unknown, inactive, and ambiguous local account mappings', async () => {
  const identity = { objectId: OBJECT_ID, tenantId: TENANT_ID, principalName: 'user@drc.example' }
  assert.throws(() => matchEntraIdentity(identity, []), { code: 'ACCOUNT_NOT_LINKED' })
  await assert.rejects(() => resolveEntraUser(identity, {
    localUsers: [{ id: 'inactive', email: identity.principalName, active: false }],
  }), { code: 'ACCOUNT_INACTIVE' })
  assert.throws(() => matchEntraIdentity(identity, [
    { id: 'one', email: identity.principalName },
    { id: 'two', email: identity.principalName.toUpperCase() },
  ]), { code: 'ACCOUNT_LINK_AMBIGUOUS' })
})

test('links exactly one active email match and creates a server-owned audit entry', async () => {
  resetAuditEntries()
  resetUsers()
  const identity = {
    objectId: OBJECT_ID,
    tenantId: TENANT_ID,
    principalName: 'passenger.two@example.invalid',
  }
  const linked = await resolveEntraUser(identity, { now: new Date('2030-01-01T00:00:00Z') })
  const audit = listAuditEntries().find((entry) => entry.action === 'ENTRA_ACCOUNT_LINKED')
  assert.equal(linked.id, 'emp-005')
  assert.equal(linked.entraObjectId, OBJECT_ID)
  assert.equal(linked.entraTenantId, TENANT_ID)
  assert.equal(audit.actorId, 'emp-005')
  assert.deepEqual(audit.before, { entraLinked: false })
  assert.equal(audit.after.entraLinked, true)
})

test('local roles remain authoritative and token role or group claims are ignored', async () => {
  const identity = await verifier().verify(await token({ roles: ['ADMIN'], groups: ['ADMIN'] }))
  assert.equal('roles' in identity, false)
  const employee = {
    id: 'employee', active: true, roles: ['EMPLOYEE'], email: identity.principalName,
    entraObjectId: identity.objectId, entraTenantId: identity.tenantId,
  }
  const resolved = await resolveEntraUser(identity, { localUsers: [employee] })
  assert.throws(() => requireRole(resolved, 'ADMIN'), { statusCode: 403 })
  assert.equal(requireRole({ ...resolved, roles: ['ADMIN'] }, 'ADMIN').id, 'employee')
})

test('Entra middleware enforces inactive accounts and local Admin roles', async () => {
  resetUsers()
  const employee = users.find((user) => user.id === 'emp-001')
  const admin = users.find((user) => user.id === 'emp-002')
  const inactive = users.find((user) => user.id === 'emp-003')
  Object.assign(employee, { entraObjectId: OBJECT_ID, entraTenantId: TENANT_ID })
  Object.assign(admin, {
    entraObjectId: '55555555-5555-4555-8555-555555555555',
    entraTenantId: TENANT_ID,
  })
  Object.assign(inactive, {
    active: false,
    entraObjectId: '66666666-6666-4666-8666-666666666666',
    entraTenantId: TENANT_ID,
  })
  const tokenVerifier = {
    async verify(value) {
      const objectId = value === 'admin-token' ? admin.entraObjectId
        : value === 'inactive-token' ? inactive.entraObjectId
          : employee.entraObjectId
      return { objectId, tenantId: TENANT_ID, principalName: null }
    },
  }
  const app = express()
  app.use((request, _response, next) => { request.id = 'entra-middleware-test'; next() })
  app.get('/admin', authenticate({ provider: 'entra', roles: ['ADMIN'], tokenVerifier }), (request, response) => {
    response.json({ id: request.user.id, roles: request.user.roles })
  })
  app.get('/auth/me', authenticate({ provider: 'entra', tokenVerifier }), getCurrentUser)
  app.use(errorHandler)
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const url = `http://127.0.0.1:${server.address().port}/admin`
  try {
    const unauthenticated = await fetch(url)
    const wrongRole = await fetch(url, { headers: { Authorization: 'Bearer employee-token' } })
    const validAdmin = await fetch(url, { headers: { Authorization: 'Bearer admin-token' } })
    const inactiveAccount = await fetch(url, { headers: { Authorization: 'Bearer inactive-token' } })
    const currentUser = await fetch(url.replace('/admin', '/auth/me'), {
      headers: { Authorization: 'Bearer admin-token' },
    })
    assert.equal(unauthenticated.status, 401)
    assert.equal((await unauthenticated.json()).code, 'AUTH_REQUIRED')
    assert.equal(wrongRole.status, 403)
    const authenticatedAdmin = await validAdmin.json()
    assert.equal(authenticatedAdmin.id, 'emp-002')
    assert.deepEqual(authenticatedAdmin.roles.toSorted(), ['ADMIN', 'EMPLOYEE', 'SAFETY'])
    assert.equal(inactiveAccount.status, 403)
    assert.equal((await inactiveAccount.json()).code, 'ACCOUNT_INACTIVE')
    const currentUserBody = (await currentUser.json()).data
    assert.equal(currentUser.status, 200)
    assert.equal(currentUserBody.id, 'emp-002')
    assert.equal(currentUserBody.authenticationProvider, 'entra')
    assert.equal('entraObjectId' in currentUserBody, false)
    assert.equal('entraTenantId' in currentUserBody, false)
    assert.equal('claims' in currentUserBody, false)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

const assert = require('node:assert/strict')
const { after, before, test } = require('node:test')
const app = require('../src/app')
const { resetUsers, users } = require('../src/data/users')

let server
let baseUrl

const testUsers = [
  { id: 'uat-employee', name: 'UAT Employee', roles: ['EMPLOYEE'], active: true },
  { id: 'uat-safety', name: 'UAT Safety', roles: ['SAFETY'], active: true },
  { id: 'uat-supply-chain', name: 'UAT Supply Chain', roles: ['SUPPLY_CHAIN'], active: true },
  { id: 'uat-area-manager', name: 'UAT Area Manager', roles: ['AREA_MANAGER'], active: true },
  { id: 'uat-admin', name: 'UAT Admin', roles: ['ADMIN'], active: true },
  { id: 'uat-multi-role', name: 'UAT Multi Role', roles: ['SAFETY', 'AREA_MANAGER'], active: true },
  { id: 'uat-inactive-admin', name: 'UAT Inactive Admin', roles: ['ADMIN'], active: false },
].map((user) => ({
  ...user,
  email: `${user.id}@example.test`,
  phone: null,
  departmentId: null,
  entraObjectId: null,
  entraTenantId: null,
  entraPrincipalName: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}))

const employeeEndpoints = [
  ['GET', '/movements'],
  ['POST', '/movements'],
  ['GET', '/movements/MOV-UNKNOWN'],
]
const safetyEndpoints = [
  ['GET', '/safety/movements'],
  ['GET', '/safety/movements/export.xlsx'],
  ['GET', '/safety/movements/final-approved?date=2099-12-31'],
  ['POST', '/safety/movements/whatsapp-preview'],
  ['GET', '/safety/movements/MOV-UNKNOWN'],
  ['PATCH', '/safety/movements/MOV-UNKNOWN/review'],
]
const supplyChainEndpoints = [
  ['GET', '/supply-chain/movements'],
  ['GET', '/supply-chain/movements/MOV-UNKNOWN'],
  ['PATCH', '/supply-chain/movements/MOV-UNKNOWN/assignment'],
]
const areaManagerEndpoints = [
  ['GET', '/area-manager/movements'],
  ['GET', '/area-manager/movements/MOV-UNKNOWN'],
  ['PATCH', '/area-manager/movements/MOV-UNKNOWN/review'],
]
const adminEndpoints = [
  ['GET', '/admin/summary'],
  ['GET', '/admin/integrations/sharepoint/status'],
  ['GET', '/admin/integrations/entra/status'],
  ['GET', '/admin/system/database-status'],
  ['GET', '/admin/users'],
  ['POST', '/admin/users'],
  ['GET', '/admin/users/emp-001'],
  ['PATCH', '/admin/users/emp-001'],
  ['PATCH', '/admin/users/emp-001/status'],
  ['PATCH', '/admin/users/emp-001/roles'],
  ['GET', '/admin/settings'],
  ['PATCH', '/admin/settings'],
  ['GET', '/admin/audit-log'],
  ['GET', '/admin/vehicles'],
  ['POST', '/admin/vehicles'],
  ['GET', '/admin/vehicles/veh-001'],
  ['PATCH', '/admin/vehicles/veh-001'],
  ['PATCH', '/admin/vehicles/veh-001/status'],
]
const authenticatedEndpoints = [
  ['GET', '/auth/me'],
  ['GET', '/employees'],
  ['GET', '/drivers'],
  ['GET', '/gps-devices'],
  ['GET', '/vehicles'],
]

before(() => {
  users.push(...testUsers)
  return new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}/api`
      resolve()
    })
  })
})

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
  resetUsers()
})

function request([method, path], userId) {
  const mutation = method === 'POST' || method === 'PATCH'
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'x-development-user-id': userId,
      ...(mutation ? { 'Content-Type': 'application/json' } : {}),
    },
    body: mutation ? '{}' : undefined,
  })
}

async function assertDenied(endpoint, userId, status) {
  const response = await request(endpoint, userId)
  const payload = await response.json()
  assert.equal(response.status, status, `${endpoint.join(' ')} should return ${status}`)
  assert.equal(payload.status, 'error')
  assert.equal('stack' in payload, false)
  assert.doesNotMatch(JSON.stringify(payload), /password|postgresql:\/\//i)
}

test('every role-protected endpoint rejects a user without its required local role', async () => {
  for (const endpoint of employeeEndpoints) await assertDenied(endpoint, 'uat-safety', 403)
  for (const endpoint of safetyEndpoints) await assertDenied(endpoint, 'uat-employee', 403)
  for (const endpoint of supplyChainEndpoints) await assertDenied(endpoint, 'uat-employee', 403)
  for (const endpoint of areaManagerEndpoints) await assertDenied(endpoint, 'uat-employee', 403)
  for (const endpoint of adminEndpoints) await assertDenied(endpoint, 'uat-employee', 403)
})

test('every protected endpoint rejects an unregistered development identity safely', async () => {
  const everyProtectedEndpoint = [
    ...authenticatedEndpoints,
    ...employeeEndpoints,
    ...safetyEndpoints,
    ...supplyChainEndpoints,
    ...areaManagerEndpoints,
    ...adminEndpoints,
  ]
  for (const endpoint of everyProtectedEndpoint) await assertDenied(endpoint, 'uat-not-registered', 401)
})

test('each single role receives only its explicitly assigned workflow permissions', async () => {
  const expectations = [
    ['uat-employee', '/movements', 200],
    ['uat-employee', '/safety/movements', 403],
    ['uat-safety', '/safety/movements', 200],
    ['uat-safety', '/supply-chain/movements', 403],
    ['uat-supply-chain', '/supply-chain/movements', 200],
    ['uat-supply-chain', '/area-manager/movements', 403],
    ['uat-area-manager', '/area-manager/movements', 200],
    ['uat-area-manager', '/admin/summary', 403],
    ['uat-admin', '/admin/summary', 200],
    ['uat-admin', '/movements', 403],
    ['uat-admin', '/safety/movements', 403],
    ['uat-admin', '/supply-chain/movements', 403],
    ['uat-admin', '/area-manager/movements', 403],
  ]
  for (const [userId, path, expectedStatus] of expectations) {
    const response = await request(['GET', path], userId)
    assert.equal(response.status, expectedStatus, `${userId} GET ${path}`)
  }
})

test('multi-role permissions are the exact union of locally assigned roles', async () => {
  assert.equal((await request(['GET', '/safety/movements'], 'uat-multi-role')).status, 200)
  assert.equal((await request(['GET', '/area-manager/movements'], 'uat-multi-role')).status, 200)
  assert.equal((await request(['GET', '/movements'], 'uat-multi-role')).status, 403)
  assert.equal((await request(['GET', '/supply-chain/movements'], 'uat-multi-role')).status, 403)
  assert.equal((await request(['GET', '/admin/summary'], 'uat-multi-role')).status, 403)
})

test('inactive accounts are rejected before their role can authorize an endpoint', async () => {
  await assertDenied(['GET', '/admin/summary'], 'uat-inactive-admin', 403)
})

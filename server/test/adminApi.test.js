const assert = require('node:assert/strict')
const { after, afterEach, before, beforeEach, test } = require('node:test')
const app = require('../src/app')
const { resetAuditEntries } = require('../src/data/adminAuditLog')
const { resetDepartments } = require('../src/data/departments')
const { resetDrivers } = require('../src/data/drivers')
const { resetGpsDevices } = require('../src/data/gpsDevices')
const { resetLocations } = require('../src/data/locations')
const { resetMovements } = require('../src/data/movementStore')
const { resetSystemSettings } = require('../src/data/systemSettings')
const { resetUsers } = require('../src/data/users')
const { resetVehicles } = require('../src/data/vehicles')
const { getCutoffContext } = require('../src/services/cutoffService')

let server
let baseUrl

before(() => {
  return new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}/api`
      resolve()
    })
  })
})

after(() => {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
})

function resetAllData() {
  resetAuditEntries()
  resetDepartments()
  resetDrivers()
  resetGpsDevices()
  resetLocations()
  resetMovements()
  resetSystemSettings()
  resetUsers()
  resetVehicles()
}

beforeEach(resetAllData)
afterEach(resetAllData)

async function apiRequest(path, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}

function create(path, body) {
  return apiRequest(path, { method: 'POST', body: JSON.stringify(body) })
}

function update(path, body) {
  return apiRequest(path, { method: 'PATCH', body: JSON.stringify(body) })
}

function validUser(overrides = {}) {
  return {
    id: 'emp-100',
    name: 'New Admin Test User',
    email: 'new.user@drc.example',
    phone: '+000000000100',
    departmentId: 'dep-programs',
    roles: ['EMPLOYEE', 'SAFETY'],
    active: true,
    ...overrides,
  }
}

test('creates a valid multi-role user and exposes it in the shared employee directory', async () => {
  const response = await create('/admin/users', validUser())
  const user = (await response.json()).data
  const employees = (await (await apiRequest('/employees')).json()).data

  assert.equal(response.status, 201)
  assert.deepEqual(user.roles, ['EMPLOYEE', 'SAFETY'])
  assert.equal(user.departmentId, 'dep-programs')
  assert.equal(user.entraLinked, false)
  assert.equal('entraObjectId' in user, false)
  assert.equal('entraTenantId' in user, false)
  assert.ok(employees.some((employee) => employee.id === user.id))
})

test('rejects duplicate user IDs and duplicate emails case-insensitively', async () => {
  assert.equal((await create('/admin/users', validUser())).status, 201)

  const duplicateId = await create('/admin/users', validUser({ email: 'other@drc.example' }))
  const duplicateEmail = await create('/admin/users', validUser({
    id: 'emp-101',
    email: 'NEW.USER@DRC.EXAMPLE',
  }))

  assert.equal(duplicateId.status, 400)
  assert.equal(duplicateEmail.status, 400)
})

test('rejects invalid roles and active users without roles', async () => {
  const invalidRole = await create('/admin/users', validUser({ roles: ['SUPER_ADMIN'] }))
  const missingRoles = await create('/admin/users', validUser({ roles: [] }))
  const invalidPayload = await invalidRole.json()
  const missingPayload = await missingRoles.json()

  assert.equal(invalidRole.status, 400)
  assert.ok(invalidPayload.errors.some((error) => error.field === 'roles'))
  assert.equal(missingRoles.status, 400)
  assert.ok(missingPayload.errors.some((error) => error.field === 'roles'))
})

test('updates user details and multiple roles', async () => {
  assert.equal((await create('/admin/users', validUser())).status, 201)
  const detailsResponse = await update('/admin/users/emp-100', {
    name: 'Updated User',
    phone: '12345',
    departmentId: 'dep-operations',
  })
  const rolesResponse = await update('/admin/users/emp-100/roles', {
    roles: ['EMPLOYEE', 'SUPPLY_CHAIN', 'AREA_MANAGER'],
  })
  const user = (await rolesResponse.json()).data

  assert.equal(detailsResponse.status, 200)
  assert.equal(rolesResponse.status, 200)
  assert.equal(user.name, 'Updated User')
  assert.deepEqual(user.roles, ['EMPLOYEE', 'SUPPLY_CHAIN', 'AREA_MANAGER'])
})

test('deactivates and reactivates a user while retaining historical readability', async () => {
  assert.equal((await create('/admin/users', validUser())).status, 201)
  const deactivateResponse = await update('/admin/users/emp-100/status', { active: false })
  const inactive = (await deactivateResponse.json()).data
  const getResponse = await apiRequest('/admin/users/emp-100')
  const fetched = (await getResponse.json()).data
  const reactivateResponse = await update('/admin/users/emp-100/status', { active: true })

  assert.equal(deactivateResponse.status, 200)
  assert.equal(inactive.active, false)
  assert.equal(getResponse.status, 200)
  assert.equal(fetched.id, 'emp-100')
  assert.equal(reactivateResponse.status, 200)
})

test('blocks nonexistent and inactive department references for users', async () => {
  const nonexistent = await create('/admin/users', validUser({ departmentId: 'dep-unknown' }))
  assert.equal(nonexistent.status, 400)

  assert.equal((await update('/admin/departments/dep-programs/status', { active: false })).status, 200)
  const inactive = await create('/admin/users', validUser())
  assert.equal(inactive.status, 400)
})

test('creates vehicles and rejects duplicate codes or plate numbers', async () => {
  const vehicle = {
    id: 'veh-100',
    code: 'DRC100',
    plateNumber: 'DRC-100',
    model: 'Toyota Prado',
    capacity: 8,
  }
  assert.equal((await create('/admin/vehicles', vehicle)).status, 201)
  assert.equal((await create('/admin/vehicles', { ...vehicle, id: 'veh-101', plateNumber: 'DRC-101' })).status, 400)
  assert.equal((await create('/admin/vehicles', { ...vehicle, id: 'veh-102', code: 'DRC102' })).status, 400)
})

test('vehicle activation changes immediately affect Supply Chain options', async () => {
  assert.equal((await create('/admin/vehicles', {
    id: 'veh-100', code: 'DRC100', plateNumber: 'DRC-100', model: 'Toyota Prado', capacity: 8,
  })).status, 201)
  let options = (await (await apiRequest('/vehicles')).json()).data
  assert.ok(options.some((vehicle) => vehicle.id === 'veh-100'))

  assert.equal((await update('/admin/vehicles/veh-100/status', { active: false })).status, 200)
  options = (await (await apiRequest('/vehicles')).json()).data
  assert.ok(!options.some((vehicle) => vehicle.id === 'veh-100'))
})

test('creates, edits, and deactivates a driver used by the shared Supply Chain store', async () => {
  assert.equal((await create('/admin/drivers', {
    id: 'drv-100', name: 'Test Driver', phone: '555100',
  })).status, 201)
  const editResponse = await update('/admin/drivers/drv-100', { name: 'Updated Driver' })
  assert.equal((await editResponse.json()).data.name, 'Updated Driver')

  let options = (await (await apiRequest('/drivers')).json()).data
  assert.ok(options.some((driver) => driver.id === 'drv-100'))
  assert.equal((await update('/admin/drivers/drv-100/status', { active: false })).status, 200)
  options = (await (await apiRequest('/drivers')).json()).data
  assert.ok(!options.some((driver) => driver.id === 'drv-100'))
})

test('creates, edits, and deactivates a GPS device used by the shared Safety store', async () => {
  assert.equal((await create('/admin/gps-devices', {
    id: 'gps-100', code: 'GPS-100', label: 'Garmin GPS 100',
  })).status, 201)
  const editResponse = await update('/admin/gps-devices/gps-100', { label: 'Updated GPS 100' })
  assert.equal((await editResponse.json()).data.label, 'Updated GPS 100')

  let options = (await (await apiRequest('/gps-devices')).json()).data
  assert.ok(options.some((device) => device.id === 'gps-100' && device.name === 'Updated GPS 100'))
  assert.equal((await update('/admin/gps-devices/gps-100/status', { active: false })).status, 200)
  options = (await (await apiRequest('/gps-devices')).json()).data
  assert.ok(!options.some((device) => device.id === 'gps-100'))
})

test('creates, edits, and deactivates a department without deleting it', async () => {
  assert.equal((await create('/admin/departments', { id: 'dep-finance', name: 'Finance' })).status, 201)
  const editResponse = await update('/admin/departments/dep-finance', { name: 'Finance and Grants' })
  assert.equal((await editResponse.json()).data.name, 'Finance and Grants')
  assert.equal((await update('/admin/departments/dep-finance/status', { active: false })).status, 200)

  const getResponse = await apiRequest('/admin/departments/dep-finance')
  const department = (await getResponse.json()).data
  assert.equal(getResponse.status, 200)
  assert.equal(department.active, false)
})

test('creates, edits, and deactivates a location with coordinates', async () => {
  assert.equal((await create('/admin/locations', {
    id: 'loc-100', name: 'Field Office', latitude: 31.5, longitude: 34.45,
  })).status, 201)
  const editResponse = await update('/admin/locations/loc-100', {
    name: 'Updated Field Office', latitude: null, longitude: null,
  })
  const edited = (await editResponse.json()).data
  assert.equal(edited.name, 'Updated Field Office')
  assert.equal(edited.latitude, null)
  assert.equal((await update('/admin/locations/loc-100/status', { active: false })).status, 200)
})

test('updates runtime cutoff settings without restarting', async () => {
  const response = await update('/admin/settings', {
    movementTimezone: 'UTC',
    movementCutoffHour: 15,
  })
  const settings = (await response.json()).data
  const cutoff = getCutoffContext('2099-12-31')

  assert.equal(response.status, 200)
  assert.deepEqual(settings, { movementTimezone: 'UTC', movementCutoffHour: 15 })
  assert.equal(cutoff.timeZone, 'UTC')
  assert.equal(cutoff.cutoffHour, 15)
})

test('rejects invalid cutoff hours and invalid timezones', async () => {
  const invalidHour = await update('/admin/settings', {
    movementTimezone: 'UTC', movementCutoffHour: 24,
  })
  const invalidTimeZone = await update('/admin/settings', {
    movementTimezone: 'Not/A_Timezone', movementCutoffHour: 12,
  })

  assert.equal(invalidHour.status, 400)
  assert.equal(invalidTimeZone.status, 400)
})

test('records server-owned Admin audit entries with update before and after snapshots', async () => {
  assert.equal((await create('/admin/vehicles', {
    id: 'veh-100',
    code: 'DRC100',
    plateNumber: 'DRC-100',
    model: 'Initial Model',
    capacity: 8,
    actorId: 'emp-999',
  })).status, 201)
  assert.equal((await update('/admin/vehicles/veh-100', {
    model: 'Updated Model', actorId: 'emp-999',
  })).status, 200)

  const response = await apiRequest('/admin/audit-log?entityType=VEHICLE&action=VEHICLE_UPDATED')
  const entries = (await response.json()).data

  assert.equal(response.status, 200)
  assert.equal(entries.length, 1)
  assert.equal(entries[0].actorId, 'emp-002')
  assert.equal(entries[0].actorName, 'Demo Safety Officer')
  assert.equal(entries[0].before.model, 'Initial Model')
  assert.equal(entries[0].after.model, 'Updated Model')
})

test('returns active-resource counts for the Admin dashboard', async () => {
  const response = await apiRequest('/admin/summary')
  const summary = (await response.json()).data

  assert.equal(response.status, 200)
  assert.deepEqual(summary, {
    activeUsers: 8,
    vehicles: 3,
    drivers: 3,
    gpsDevices: 2,
    departments: 5,
    locations: 2,
  })
})

test('reports safe Admin-only operational database status', async () => {
  const response = await apiRequest('/admin/system/database-status')
  const status = (await response.json()).data
  const forbidden = await apiRequest('/admin/system/database-status', {
    headers: { 'x-development-user-id': 'emp-001' },
  })

  assert.equal(response.status, 200)
  assert.deepEqual(status, {
    provider: 'sqlite',
    connected: true,
    migrationStatus: 'up-to-date',
    serverTime: status.serverTime,
    message: 'SQLite operational database connected',
  })
  assert.match(status.serverTime, /^\d{4}-\d{2}-\d{2}T/)
  assert.equal(forbidden.status, 403)
  assert.equal('databaseUrl' in status, false)
})

test('reports sanitized Admin-only Entra configuration status', async () => {
  const response = await apiRequest('/admin/integrations/entra/status')
  const status = (await response.json()).data
  const forbidden = await apiRequest('/admin/integrations/entra/status', {
    headers: { 'x-development-user-id': 'emp-001' },
  })

  assert.equal(response.status, 200)
  assert.equal(status.enabled, false)
  assert.equal(status.authProvider, 'development')
  assert.equal(status.metadata, 'not-tested')
  assert.equal('tenantId' in status, false)
  assert.equal('clientId' in status, false)
  assert.equal(forbidden.status, 403)
})

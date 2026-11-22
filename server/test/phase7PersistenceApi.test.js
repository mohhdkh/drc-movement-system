const assert = require('node:assert/strict')
const { fork } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { afterEach, test } = require('node:test')
const Database = require('better-sqlite3')

const workerPath = path.resolve(__dirname, '../test-support/phase7Server.js')
const temporaryDirectories = []
const runningWorkers = new Set()

function createDatabasePath() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'drc-phase7-'))
  temporaryDirectories.push(directory)
  return path.join(directory, 'phase7.sqlite')
}

function startServer(databasePath, environment = {}) {
  return new Promise((resolve, reject) => {
    const worker = fork(workerPath, [], {
      env: {
        ...process.env,
        AUTH_MODE: 'development',
        DATABASE_PATH: databasePath,
        NODE_ENV: 'test',
        ...environment,
      },
      silent: true,
    })
    runningWorkers.add(worker)
    const timeout = setTimeout(() => reject(new Error('Phase 7 test server did not start.')), 10000)
    worker.once('error', reject)
    worker.once('message', ({ port }) => {
      clearTimeout(timeout)
      resolve({ baseUrl: `http://127.0.0.1:${port}/api`, worker })
    })
  })
}

function stopServer(worker) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      worker.kill()
      reject(new Error('Phase 7 test server did not stop.'))
    }, 10000)
    worker.once('exit', () => {
      clearTimeout(timeout)
      runningWorkers.delete(worker)
      resolve()
    })
    worker.send('shutdown')
  })
}

function api(baseUrl, pathName, { userId, body, method = 'GET' } = {}) {
  return fetch(`${baseUrl}${pathName}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(userId ? { 'x-development-user-id': userId } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

async function jsonData(response) {
  const payload = await response.json()
  assert.ok(response.ok, `${response.status}: ${payload.message}`)
  return payload.data
}

function movementRequest() {
  return {
    requesterId: 'emp-003',
    movementDate: '2099-12-31',
    purpose: 'Phase 7 persistence verification',
    etd: '08:00',
    eta: '12:00',
    startLocation: 'DRC Office Gaza',
    routePoints: ['Site A', 'DRC Office Gaza'],
    vehicleLeaderId: 'emp-001',
    notes: 'Persist the complete workflow.',
    segments: [
      { arrivalTime: '09:00', departureTime: '09:30', passengerIds: ['emp-001', 'emp-002'] },
      { arrivalTime: '11:30', departureTime: '12:00', passengerIds: ['emp-001'] },
    ],
  }
}

afterEach(async () => {
  await Promise.all([...runningWorkers].map((worker) => stopServer(worker)))
  while (temporaryDirectories.length) {
    fs.rmSync(temporaryDirectories.pop(), { recursive: true, force: true })
  }
})

test('persists users, roles, resources, settings, audit data, and the full movement workflow across restart', async () => {
  const databasePath = createDatabasePath()
  let runtime = await startServer(databasePath)

  const user = await jsonData(await api(runtime.baseUrl, '/admin/users', {
    userId: 'emp-002',
    method: 'POST',
    body: {
      id: 'emp-persist',
      name: 'Persistent Multi Role User',
      email: 'persistent@drc.example',
      departmentId: 'dep-programs',
      roles: ['EMPLOYEE', 'SAFETY', 'SUPPLY_CHAIN'],
      active: true,
    },
  }))
  assert.deepEqual(user.roles, ['EMPLOYEE', 'SAFETY', 'SUPPLY_CHAIN'])

  await jsonData(await api(runtime.baseUrl, '/admin/vehicles/veh-002/status', {
    userId: 'emp-002', method: 'PATCH', body: { active: false },
  }))
  await jsonData(await api(runtime.baseUrl, '/admin/drivers/drv-002/status', {
    userId: 'emp-002', method: 'PATCH', body: { active: false },
  }))
  await jsonData(await api(runtime.baseUrl, '/admin/gps-devices/gps-002/status', {
    userId: 'emp-002', method: 'PATCH', body: { active: false },
  }))
  await jsonData(await api(runtime.baseUrl, '/admin/departments', {
    userId: 'emp-002', method: 'POST', body: { id: 'dep-persist', name: 'Persistent Department' },
  }))
  await jsonData(await api(runtime.baseUrl, '/admin/locations', {
    userId: 'emp-002',
    method: 'POST',
    body: { id: 'loc-persist', name: 'Persistent Location', latitude: 31.5, longitude: 34.4 },
  }))
  await jsonData(await api(runtime.baseUrl, '/admin/settings', {
    userId: 'emp-002',
    method: 'PATCH',
    body: { movementTimezone: 'UTC', movementCutoffHour: 9, actorId: 'emp-999' },
  }))

  const movement = await jsonData(await api(runtime.baseUrl, '/movements', {
    userId: 'emp-001', method: 'POST', body: movementRequest(),
  }))
  assert.equal(movement.requesterId, 'emp-001')

  const safetyApproved = await jsonData(await api(runtime.baseUrl, `/safety/movements/${movement.id}/review`, {
    userId: 'emp-002',
    method: 'PATCH',
    body: {
      action: 'APPROVE',
      reviewedBy: 'emp-999',
      gpsAssignment: { type: 'DEVICE', gpsDeviceId: 'gps-001' },
    },
  }))
  assert.equal(safetyApproved.safetyReview.reviewedBy, 'emp-002')

  const assigned = await jsonData(await api(runtime.baseUrl, `/supply-chain/movements/${movement.id}/assignment`, {
    userId: 'emp-006',
    method: 'PATCH',
    body: { assignedBy: 'emp-999', vehicleId: 'veh-001', driverId: 'drv-001' },
  }))
  assert.equal(assigned.supplyChainAssignment.assignedBy, 'emp-006')

  const approved = await jsonData(await api(runtime.baseUrl, `/area-manager/movements/${movement.id}/review`, {
    userId: 'emp-004',
    method: 'PATCH',
    body: { decision: 'APPROVED', reviewedBy: 'emp-999' },
  }))
  assert.equal(approved.status, 'FINAL_APPROVED')
  assert.equal(approved.areaManagerApproval.reviewedBy, 'emp-004')

  await stopServer(runtime.worker)
  runtime = await startServer(databasePath)

  const persistedUser = await jsonData(await api(runtime.baseUrl, '/admin/users/emp-persist', { userId: 'emp-002' }))
  const persistedVehicle = await jsonData(await api(runtime.baseUrl, '/admin/vehicles/veh-002', { userId: 'emp-002' }))
  const persistedDriver = await jsonData(await api(runtime.baseUrl, '/admin/drivers/drv-002', { userId: 'emp-002' }))
  const persistedGps = await jsonData(await api(runtime.baseUrl, '/admin/gps-devices/gps-002', { userId: 'emp-002' }))
  const persistedDepartment = await jsonData(await api(runtime.baseUrl, '/admin/departments/dep-persist', { userId: 'emp-002' }))
  const persistedLocation = await jsonData(await api(runtime.baseUrl, '/admin/locations/loc-persist', { userId: 'emp-002' }))
  const settings = await jsonData(await api(runtime.baseUrl, '/admin/settings', { userId: 'emp-002' }))
  const audit = await jsonData(await api(runtime.baseUrl, '/admin/audit-log', { userId: 'emp-002' }))
  const persistedMovement = await jsonData(await api(
    runtime.baseUrl,
    `/area-manager/movements/${movement.id}`,
    { userId: 'emp-004' },
  ))

  assert.deepEqual(persistedUser.roles, ['EMPLOYEE', 'SAFETY', 'SUPPLY_CHAIN'])
  assert.equal(persistedVehicle.active, false)
  assert.equal(persistedDriver.active, false)
  assert.equal(persistedGps.active, false)
  assert.equal(persistedDepartment.name, 'Persistent Department')
  assert.deepEqual(
    [persistedLocation.latitude, persistedLocation.longitude],
    [31.5, 34.4],
  )
  assert.deepEqual(settings, { movementTimezone: 'UTC', movementCutoffHour: 9 })
  assert.ok(audit.length >= 3)
  assert.ok(audit.every((entry) => entry.actorId === 'emp-002'))
  assert.equal(persistedMovement.status, 'FINAL_APPROVED')
  assert.deepEqual(persistedMovement.segments[0].passengerIds, ['emp-001', 'emp-002'])
  assert.equal(persistedMovement.gpsAssignment.gpsDeviceId, 'gps-001')
  assert.equal(persistedMovement.supplyChainAssignment.vehicleId, 'veh-001')

  await stopServer(runtime.worker)
  const database = new Database(databasePath, { readonly: true })
  const history = database.prepare(`
    SELECT status FROM movement_status_history WHERE movement_id = ? ORDER BY id
  `).all(movement.id).map((row) => row.status)
  database.close()
  assert.deepEqual(history, [
    'PENDING_SAFETY',
    'SAFETY_APPROVED',
    'VEHICLE_ASSIGNED',
    'FINAL_APPROVED',
  ])
})

test('enforces authoritative roles and rejects unknown or inactive development identities', async () => {
  const runtime = await startServer(createDatabasePath())

  assert.equal((await api(runtime.baseUrl, '/admin/summary', { userId: 'emp-001' })).status, 403)
  assert.equal((await api(runtime.baseUrl, '/safety/movements', { userId: 'emp-001' })).status, 403)
  assert.equal((await api(runtime.baseUrl, '/auth/me', { userId: 'emp-999' })).status, 401)

  await jsonData(await api(runtime.baseUrl, '/admin/users/emp-003/status', {
    userId: 'emp-002', method: 'PATCH', body: { active: false },
  }))
  assert.equal((await api(runtime.baseUrl, '/auth/me', { userId: 'emp-003' })).status, 403)
})

test('disables development authentication fallback in production', async () => {
  const runtime = await startServer(createDatabasePath(), { NODE_ENV: 'production' })
  assert.equal((await api(runtime.baseUrl, '/auth/me', { userId: 'emp-001' })).status, 401)
  assert.equal((await api(runtime.baseUrl, '/health')).status, 200)
})

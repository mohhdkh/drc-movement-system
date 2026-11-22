const assert = require('node:assert/strict')
const { after, before, beforeEach, test } = require('node:test')
const app = require('../src/app')
const { resetMovements } = require('../src/data/movementStore')
const { resetVehicles } = require('../src/data/vehicles')

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

beforeEach(() => {
  resetMovements()
  resetVehicles()
})

function movementRequest(overrides = {}) {
  const request = {
    requesterId: 'emp-001',
    movementDate: '2099-12-31',
    purpose: 'Supply Chain assignment test',
    etd: '09:00',
    eta: '11:00',
    startLocation: 'DRC Office Gaza',
    routePoints: ['Site A', 'DRC Office Gaza'],
    vehicleLeaderId: 'emp-001',
    notes: 'Phase 4 test request.',
    segments: [
      { arrivalTime: '09:45', departureTime: '10:15', passengerIds: ['emp-001', 'emp-002'] },
      { arrivalTime: '10:45', departureTime: '11:00', passengerIds: ['emp-001'] },
    ],
    ...overrides,
  }
  if (overrides.etd || overrides.eta) {
    request.segments = request.segments.map((segment, index) => ({
      ...segment,
      ...(index === 0 && overrides.etd ? { departureTime: overrides.etd } : {}),
      ...(index === request.segments.length - 1 && overrides.eta ? { arrivalTime: overrides.eta } : {}),
    }))
  }
  return request
}

async function apiRequest(path, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}

async function createPendingMovement(overrides = {}) {
  const response = await apiRequest('/movements', {
    method: 'POST',
    body: JSON.stringify(movementRequest(overrides)),
  })
  assert.equal(response.status, 201)
  return (await response.json()).data
}

async function createSafetyApprovedMovement(overrides = {}) {
  const movement = await createPendingMovement(overrides)
  const response = await apiRequest(`/safety/movements/${movement.id}/review`, {
    method: 'PATCH',
    body: JSON.stringify({
      action: 'APPROVE',
      reviewedBy: 'emp-002',
      comment: 'Approved for assignment.',
      gpsAssignment: { type: 'NO_GPS', gpsDeviceId: null },
    }),
  })
  assert.equal(response.status, 200)
  return (await response.json()).data
}

async function assignMovement(id, overrides = {}) {
  return apiRequest(`/supply-chain/movements/${id}/assignment`, {
    method: 'PATCH',
    body: JSON.stringify({
      assignedBy: 'emp-006',
      vehicleId: 'veh-001',
      driverId: 'drv-001',
      comment: 'Assigned for planned field movement.',
      ...overrides,
    }),
  })
}

test('GET resource endpoints return only active vehicles and drivers', async () => {
  const [vehicleResponse, driverResponse] = await Promise.all([
    apiRequest('/vehicles'),
    apiRequest('/drivers'),
  ])
  const vehicles = (await vehicleResponse.json()).data
  const drivers = (await driverResponse.json()).data

  assert.equal(vehicleResponse.status, 200)
  assert.equal(driverResponse.status, 200)
  assert.deepEqual(vehicles.map((vehicle) => vehicle.id), ['veh-001', 'veh-002', 'veh-003'])
  assert.deepEqual(drivers.map((driver) => driver.id), ['drv-001', 'drv-002', 'drv-003'])
})

test('assigns an active vehicle and driver to a Safety-approved movement', async () => {
  const movement = await createSafetyApprovedMovement()
  const response = await assignMovement(movement.id)
  const assigned = (await response.json()).data

  assert.equal(response.status, 200)
  assert.equal(assigned.status, 'VEHICLE_ASSIGNED')
  assert.equal(assigned.supplyChainAssignment.assignedBy, 'emp-006')
  assert.equal(assigned.supplyChainAssignment.vehicleId, 'veh-001')
  assert.equal(assigned.supplyChainAssignment.driverId, 'drv-001')
})

test('rejects a vehicle whose total capacity cannot include passengers and driver', async () => {
  const passengers = ['emp-001', 'emp-002', 'emp-003', 'emp-004', 'emp-005']
  const movement = await createSafetyApprovedMovement({
    segments: [
      { arrivalTime: '09:45', departureTime: '10:15', passengerIds: passengers },
      { arrivalTime: '10:45', departureTime: '11:00', passengerIds: ['emp-001'] },
    ],
  })
  const response = await assignMovement(movement.id, { vehicleId: 'veh-002' })
  const payload = await response.json()

  assert.equal(response.status, 400)
  assert.ok(payload.errors.some((error) => error.field === 'vehicleId' && error.message.includes('including the driver')))
})

test('requires a vehicle', async () => {
  const movement = await createSafetyApprovedMovement()
  const response = await assignMovement(movement.id, { vehicleId: '' })
  const payload = await response.json()

  assert.equal(response.status, 400)
  assert.ok(payload.errors.some((error) => error.field === 'vehicleId'))
})

test('requires a driver', async () => {
  const movement = await createSafetyApprovedMovement()
  const response = await assignMovement(movement.id, { driverId: '' })
  const payload = await response.json()

  assert.equal(response.status, 400)
  assert.ok(payload.errors.some((error) => error.field === 'driverId'))
})

test('rejects inactive and nonexistent vehicles', async () => {
  for (const vehicleId of ['veh-004', 'veh-999']) {
    resetMovements()
    const movement = await createSafetyApprovedMovement()
    const response = await assignMovement(movement.id, { vehicleId })
    const payload = await response.json()

    assert.equal(response.status, 400)
    assert.ok(payload.errors.some((error) => error.field === 'vehicleId'))
  }
})

test('rejects inactive and nonexistent drivers', async () => {
  for (const driverId of ['drv-004', 'drv-999']) {
    resetMovements()
    const movement = await createSafetyApprovedMovement()
    const response = await assignMovement(movement.id, { driverId })
    const payload = await response.json()

    assert.equal(response.status, 400)
    assert.ok(payload.errors.some((error) => error.field === 'driverId'))
  }
})

test('rejects assignment while movement is pending Safety review', async () => {
  const movement = await createPendingMovement()
  const response = await assignMovement(movement.id)

  assert.equal(response.status, 409)
})

test('rejects assignment after Safety rejected the movement', async () => {
  const movement = await createPendingMovement()
  const rejectResponse = await apiRequest(`/safety/movements/${movement.id}/review`, {
    method: 'PATCH',
    body: JSON.stringify({
      action: 'REJECT',
      reviewedBy: 'emp-002',
      comment: 'Rejected for test coverage.',
    }),
  })
  assert.equal(rejectResponse.status, 200)

  const response = await assignMovement(movement.id)
  assert.equal(response.status, 409)
})

test('blocks a second assignment', async () => {
  const movement = await createSafetyApprovedMovement()
  const firstResponse = await assignMovement(movement.id)
  const secondResponse = await assignMovement(movement.id)

  assert.equal(firstResponse.status, 200)
  assert.equal(secondResponse.status, 409)
})

test('blocks overlapping assignments for the same vehicle', async () => {
  const first = await createSafetyApprovedMovement({ etd: '09:00', eta: '11:00' })
  const second = await createSafetyApprovedMovement({
    purpose: 'Overlapping vehicle request',
    etd: '10:00',
    eta: '12:00',
  })
  assert.equal((await assignMovement(first.id, { driverId: 'drv-001' })).status, 200)

  const response = await assignMovement(second.id, { driverId: 'drv-002' })
  const payload = await response.json()

  assert.equal(response.status, 409)
  assert.ok(payload.errors.some((error) => error.field === 'vehicleId'))
})

test('allows touching assignments for the same vehicle', async () => {
  const first = await createSafetyApprovedMovement({ etd: '09:00', eta: '10:00' })
  const second = await createSafetyApprovedMovement({
    purpose: 'Touching vehicle request',
    etd: '10:00',
    eta: '11:00',
  })

  assert.equal((await assignMovement(first.id, { driverId: 'drv-001' })).status, 200)
  assert.equal((await assignMovement(second.id, { driverId: 'drv-002' })).status, 200)
})

test('blocks overlapping assignments for the same driver', async () => {
  const first = await createSafetyApprovedMovement({ etd: '09:00', eta: '11:00' })
  const second = await createSafetyApprovedMovement({
    purpose: 'Overlapping driver request',
    etd: '10:00',
    eta: '12:00',
  })
  assert.equal((await assignMovement(first.id, { vehicleId: 'veh-001' })).status, 200)

  const response = await assignMovement(second.id, { vehicleId: 'veh-002' })
  const payload = await response.json()

  assert.equal(response.status, 409)
  assert.ok(payload.errors.some((error) => error.field === 'driverId'))
})

test('allows touching assignments for the same driver', async () => {
  const first = await createSafetyApprovedMovement({ etd: '09:00', eta: '10:00' })
  const second = await createSafetyApprovedMovement({
    purpose: 'Touching driver request',
    etd: '10:00',
    eta: '11:00',
  })

  assert.equal((await assignMovement(first.id, { vehicleId: 'veh-001' })).status, 200)
  assert.equal((await assignMovement(second.id, { vehicleId: 'veh-002' })).status, 200)
})

test('allows simultaneous movements with different vehicles and drivers', async () => {
  const first = await createSafetyApprovedMovement()
  const second = await createSafetyApprovedMovement({ purpose: 'Separate resources' })

  assert.equal((await assignMovement(first.id)).status, 200)
  assert.equal((await assignMovement(second.id, {
    vehicleId: 'veh-002',
    driverId: 'drv-002',
  })).status, 200)
})

test('ignores client status and protected Safety/GPS modifications', async () => {
  for (const status of ['FINAL_APPROVED', 'PENDING_AREA_MANAGER']) {
    resetMovements()
    const movement = await createSafetyApprovedMovement()
    const response = await assignMovement(movement.id, {
      status,
      safetyReview: { decision: 'REJECTED' },
      gpsAssignment: { type: 'DEVICE', gpsDeviceId: 'gps-999' },
    })
    const assigned = (await response.json()).data

    assert.equal(response.status, 200)
    assert.equal(assigned.status, 'VEHICLE_ASSIGNED')
    assert.equal(assigned.safetyReview.decision, 'APPROVED')
    assert.deepEqual(assigned.gpsAssignment, { type: 'NO_GPS', gpsDeviceId: null })
  }
})

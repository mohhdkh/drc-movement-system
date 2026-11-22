const assert = require('node:assert/strict')
const { after, before, beforeEach, test } = require('node:test')
const app = require('../src/app')
const { resetMovements } = require('../src/data/movementStore')

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
})

function movementRequest(overrides = {}) {
  const request = {
    requesterId: 'emp-001',
    movementDate: '2099-12-31',
    purpose: 'Safety review test movement',
    etd: '09:00',
    eta: '11:00',
    startLocation: 'DRC Office Gaza',
    routePoints: ['Site A', 'DRC Office Gaza'],
    vehicleLeaderId: 'emp-001',
    notes: 'Test request.',
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

async function createMovement(overrides = {}) {
  const response = await apiRequest('/movements', {
    method: 'POST',
    body: JSON.stringify(movementRequest(overrides)),
  })
  assert.equal(response.status, 201)
  return (await response.json()).data
}

async function reviewMovement(id, body) {
  return apiRequest(`/safety/movements/${id}/review`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

function approval(gpsAssignment) {
  return {
    action: 'APPROVE',
    reviewedBy: 'emp-002',
    comment: 'Route and passenger list reviewed.',
    gpsAssignment,
  }
}

test('GET /gps-devices returns only active devices', async () => {
  const response = await apiRequest('/gps-devices')
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.deepEqual(payload.data.map((device) => device.id), ['gps-001', 'gps-002'])
})

test('approves a pending movement with an active GPS device', async () => {
  const movement = await createMovement()
  const response = await reviewMovement(
    movement.id,
    approval({ type: 'DEVICE', gpsDeviceId: 'gps-001' }),
  )
  const reviewed = (await response.json()).data

  assert.equal(response.status, 200)
  assert.equal(reviewed.status, 'SAFETY_APPROVED')
  assert.equal(reviewed.safetyReview.decision, 'APPROVED')
  assert.equal(reviewed.safetyReview.reviewedBy, 'emp-002')
  assert.deepEqual(reviewed.gpsAssignment, {
    type: 'DEVICE',
    gpsDeviceId: 'gps-001',
  })
})

test('approves a pending movement with No GPS Required', async () => {
  const movement = await createMovement()
  const response = await reviewMovement(
    movement.id,
    approval({ type: 'NO_GPS', gpsDeviceId: null }),
  )
  const reviewed = (await response.json()).data

  assert.equal(response.status, 200)
  assert.equal(reviewed.status, 'SAFETY_APPROVED')
  assert.deepEqual(reviewed.gpsAssignment, {
    type: 'NO_GPS',
    gpsDeviceId: null,
  })
})

test('rejects approval without an explicit GPS selection', async () => {
  const movement = await createMovement()
  const response = await reviewMovement(movement.id, approval(undefined))
  const payload = await response.json()

  assert.equal(response.status, 400)
  assert.ok(payload.errors.some((error) => error.field === 'gpsAssignment.type'))
})

test('rejects inactive and nonexistent GPS devices', async () => {
  for (const gpsDeviceId of ['gps-003', 'gps-999']) {
    resetMovements()
    const movement = await createMovement()
    const response = await reviewMovement(
      movement.id,
      approval({ type: 'DEVICE', gpsDeviceId }),
    )
    const payload = await response.json()

    assert.equal(response.status, 400)
    assert.ok(
      payload.errors.some((error) => error.field === 'gpsAssignment.gpsDeviceId'),
    )
  }
})

test('requires a comment when rejecting a movement', async () => {
  const movement = await createMovement()
  const response = await reviewMovement(movement.id, {
    action: 'REJECT',
    reviewedBy: 'emp-002',
  })
  const payload = await response.json()

  assert.equal(response.status, 400)
  assert.ok(payload.errors.some((error) => error.field === 'comment'))
})

test('requires a comment when returning a movement', async () => {
  const movement = await createMovement()
  const response = await reviewMovement(movement.id, {
    action: 'RETURN',
    reviewedBy: 'emp-002',
  })
  const payload = await response.json()

  assert.equal(response.status, 400)
  assert.ok(payload.errors.some((error) => error.field === 'comment'))
})

test('records a valid rejection', async () => {
  const movement = await createMovement()
  const response = await reviewMovement(movement.id, {
    action: 'REJECT',
    reviewedBy: 'emp-002',
    comment: 'The route cannot be approved.',
  })
  const reviewed = (await response.json()).data

  assert.equal(response.status, 200)
  assert.equal(reviewed.status, 'SAFETY_REJECTED')
  assert.equal(reviewed.safetyReview.decision, 'REJECTED')
  assert.equal(reviewed.safetyReview.comment, 'The route cannot be approved.')
})

test('records a valid return for modification', async () => {
  const movement = await createMovement()
  const response = await reviewMovement(movement.id, {
    action: 'RETURN',
    reviewedBy: 'emp-002',
    comment: 'Correct the second destination.',
  })
  const reviewed = (await response.json()).data

  assert.equal(response.status, 200)
  assert.equal(reviewed.status, 'RETURNED_FOR_MODIFICATION')
  assert.equal(reviewed.safetyReview.decision, 'RETURNED')
})

test('blocks a second Safety decision on an already reviewed movement', async () => {
  const movement = await createMovement()
  const firstResponse = await reviewMovement(
    movement.id,
    approval({ type: 'NO_GPS', gpsDeviceId: null }),
  )
  assert.equal(firstResponse.status, 200)

  const secondResponse = await reviewMovement(
    movement.id,
    approval({ type: 'NO_GPS', gpsDeviceId: null }),
  )
  const payload = await secondResponse.json()

  assert.equal(secondResponse.status, 409)
  assert.ok(payload.errors.some((error) => error.field === 'status'))
})

test('rejects an unknown Safety action', async () => {
  const movement = await createMovement()
  const response = await reviewMovement(movement.id, {
    action: 'ESCALATE',
    reviewedBy: 'emp-002',
  })
  const payload = await response.json()

  assert.equal(response.status, 400)
  assert.ok(payload.errors.some((error) => error.field === 'action'))
})

test('blocks overlapping reservations for the same GPS device', async () => {
  const first = await createMovement({ etd: '09:00', eta: '11:00' })
  const second = await createMovement({
    purpose: 'Overlapping movement',
    etd: '10:00',
    eta: '12:00',
  })

  const firstResponse = await reviewMovement(
    first.id,
    approval({ type: 'DEVICE', gpsDeviceId: 'gps-001' }),
  )
  assert.equal(firstResponse.status, 200)

  const secondResponse = await reviewMovement(
    second.id,
    approval({ type: 'DEVICE', gpsDeviceId: 'gps-001' }),
  )
  const payload = await secondResponse.json()

  assert.equal(secondResponse.status, 409)
  assert.ok(
    payload.errors.some((error) => error.field === 'gpsAssignment.gpsDeviceId'),
  )
})

test('allows touching, non-overlapping GPS reservations', async () => {
  const first = await createMovement({ etd: '09:00', eta: '10:00' })
  const second = await createMovement({
    purpose: 'Following movement',
    etd: '10:00',
    eta: '11:00',
  })

  const firstResponse = await reviewMovement(
    first.id,
    approval({ type: 'DEVICE', gpsDeviceId: 'gps-001' }),
  )
  const secondResponse = await reviewMovement(
    second.id,
    approval({ type: 'DEVICE', gpsDeviceId: 'gps-001' }),
  )

  assert.equal(firstResponse.status, 200)
  assert.equal(secondResponse.status, 200)
})

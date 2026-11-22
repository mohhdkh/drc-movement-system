const assert = require('node:assert/strict')
const { after, before, beforeEach, test } = require('node:test')
const app = require('../src/app')
const { users } = require('../src/data/users')
const { listAuditEntries, resetAuditEntries } = require('../src/data/adminAuditLog')
const { resetMovements } = require('../src/data/movementStore')
const { createMovement, updateEmployeeMovement } = require('../src/services/movementService')
const { isAfterSubmissionCutoff } = require('../src/services/cutoffService')

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
  resetAuditEntries()
})

function validRequest(overrides = {}) {
  return {
    requesterId: 'emp-001',
    movementDate: '2099-12-31',
    purpose: 'Field monitoring visit',
    etd: '08:00',
    eta: '16:30',
    startLocation: 'DRC Office Gaza',
    routePoints: ['Site A', 'Site B', 'DRC Office Gaza'],
    vehicleLeaderId: 'emp-001',
    notes: 'Coordinate with the field team.',
    segments: [
      { arrivalTime: '09:30', departureTime: '10:15', passengerIds: ['emp-001', 'emp-002', 'emp-003'] },
      { arrivalTime: '11:00', departureTime: '11:45', passengerIds: ['emp-001', 'emp-003'] },
      { arrivalTime: '16:15', departureTime: '16:30', passengerIds: ['emp-001'] },
    ],
    ...overrides,
  }
}

async function postMovement(body) {
  return fetch(`${baseUrl}/movements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

test('GET /employees returns the mock employee directory', async () => {
  const response = await fetch(`${baseUrl}/employees`)
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.equal(payload.data.length, 62)
  assert.equal(payload.data[0].displayName, 'Abd Al-Hai Abd Al-Jawad')
})

test('GET /locations returns active master locations alphabetically', async () => {
  const response = await fetch(`${baseUrl}/locations`)
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.ok(payload.data.length > 0)
  assert.ok(payload.data.every((location) => location.id && location.name && 'latitude' in location && 'longitude' in location))
  assert.deepEqual(
    payload.data.map((location) => location.name),
    [...payload.data].map((location) => location.name).sort((left, right) => left.localeCompare(right)),
  )
})

test('rejects a request without a Vehicle Leader', async () => {
  const response = await postMovement(validRequest({ vehicleLeaderId: '' }))
  const payload = await response.json()

  assert.equal(response.status, 400)
  assert.ok(payload.errors.some((error) => error.field === 'vehicleLeaderId'))
})

test('rejects a request when the Vehicle Leader is missing from a segment', async () => {
  const request = validRequest()
  request.segments[1] = {
    ...request.segments[1],
    passengerIds: ['emp-003'],
  }

  const response = await postMovement(request)
  const payload = await response.json()

  assert.equal(response.status, 400)
  assert.ok(payload.errors.some((error) => error.field === 'segments.1.passengerIds'))
})

test('requires valid arrival and departure times for every stop', async () => {
  const request = validRequest()
  request.segments[0].arrivalTime = ''
  request.segments[1].departureTime = '25:00'

  const response = await postMovement(request)
  const payload = await response.json()

  assert.equal(response.status, 400)
  assert.ok(payload.errors.some((error) => error.field === 'segments.0.arrivalTime'))
  assert.ok(payload.errors.some((error) => error.field === 'segments.1.departureTime'))
})

test('validates route-chain times in five-minute intervals and chronological order', async () => {
  const valid = validRequest({
    startDepartureTime: '08:00',
    segments: [
      { arrivalTime: '08:30', departureTime: '08:00', passengerIds: ['emp-001'] },
      { arrivalTime: '09:30', departureTime: '09:00', passengerIds: ['emp-001'] },
      { arrivalTime: '10:45', departureTime: '10:00', passengerIds: ['emp-001'] },
    ],
  })
  const accepted = await postMovement(valid)
  assert.equal(accepted.status, 201)
  assert.equal((await accepted.json()).data.etd, '08:00')

  const invalid = validRequest({
    startDepartureTime: '08:03',
    segments: valid.segments,
  })
  const invalidResponse = await postMovement(invalid)
  const invalidPayload = await invalidResponse.json()
  assert.equal(invalidResponse.status, 400)
  assert.ok(invalidPayload.errors.some((error) => error.field === 'startDepartureTime'))

  const backwards = validRequest({
    startDepartureTime: '09:00',
    segments: [{ ...valid.segments[0], arrivalTime: '08:30' }, ...valid.segments.slice(1)],
  })
  const backwardsResponse = await postMovement(backwards)
  const backwardsPayload = await backwardsResponse.json()
  assert.equal(backwardsResponse.status, 400)
  assert.ok(backwardsPayload.errors.some((error) => error.field === 'segments.0.arrivalTime'))

  const fiveMinuteAccepted = await postMovement(validRequest({
    startDepartureTime: '08:05',
    segments: [
      { arrivalTime: '08:30', departureTime: '08:05', passengerIds: ['emp-001'] },
      { arrivalTime: '09:30', departureTime: '09:00', passengerIds: ['emp-001'] },
      { arrivalTime: '10:45', departureTime: '10:00', passengerIds: ['emp-001'] },
    ],
  }))
  assert.equal(fiveMinuteAccepted.status, 201)

  const seventeenMinutes = await postMovement(validRequest({
    startDepartureTime: '09:17',
    segments: [
      { arrivalTime: '09:30', departureTime: '09:17', passengerIds: ['emp-001'] },
      ...valid.segments.slice(1),
    ],
  }))
  assert.equal(seventeenMinutes.status, 400)
})

test('rejects a request after its submission cutoff', async () => {
  const response = await postMovement(validRequest({ movementDate: '2020-01-01' }))
  const payload = await response.json()

  assert.equal(response.status, 400)
  assert.ok(payload.errors.some((error) => error.field === 'movementDate'))

  assert.equal(
    isAfterSubmissionCutoff(
      '2026-09-05',
      new Date('2026-09-04T11:59:59Z'),
      { timeZone: 'UTC', cutoffHour: 12 },
    ),
    false,
  )
  assert.equal(
    isAfterSubmissionCutoff(
      '2026-09-05',
      new Date('2026-09-04T12:00:00Z'),
      { timeZone: 'UTC', cutoffHour: 12 },
    ),
    true,
  )
})

test('creates dynamic segments with different passenger lists', async () => {
  const response = await postMovement(validRequest())
  const payload = await response.json()
  const movement = payload.data

  assert.equal(response.status, 201)
  assert.equal(movement.status, 'PENDING_SAFETY')
  assert.deepEqual(
    movement.segments.map((segment) => segment.code),
    ['M01', 'M02', 'M03'],
  )
  assert.deepEqual(
    movement.segments.map((segment) => [segment.fromLocation, segment.toLocation]),
    [
      ['DRC Office Gaza', 'Site A'],
      ['Site A', 'Site B'],
      ['Site B', 'DRC Office Gaza'],
    ],
  )
  assert.deepEqual(movement.segments[1].passengerIds, ['emp-001', 'emp-003'])
  assert.deepEqual(
    movement.segments.map((segment) => [segment.arrivalTime, segment.departureTime]),
    [
      ['09:30', '10:15'],
      ['11:00', '11:45'],
      ['16:15', '16:30'],
    ],
  )
})

test('derives ETD and ETA from segment times and ignores client overrides', async () => {
  const response = await postMovement(validRequest({ etd: '01:00', eta: '02:00' }))
  const movement = (await response.json()).data

  assert.equal(response.status, 201)
  assert.equal(movement.etd, '10:15')
  assert.equal(movement.eta, '16:15')
})

test('enforces valid, unique passengers and the seven-passenger limit', async () => {
  const tooMany = validRequest({
    segments: validRequest().segments.map((segment, index) => index === 0
      ? { ...segment, passengerIds: ['emp-001', 'emp-002', 'emp-003', 'emp-004', 'emp-005', 'emp-006', 'emp-007', 'emp-001'] }
      : segment),
  })
  const response = await postMovement(tooMany)
  const payload = await response.json()

  assert.equal(response.status, 400)
  assert.ok(payload.errors.some((error) => error.field === 'segments.0.passengerIds'))
})

test('employee edits recalculate the movement and preserve audit history', async () => {
  const created = (await (await postMovement(validRequest())).json()).data
  const response = await fetch(`${baseUrl}/movements/${created.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      movementDate: created.movementDate,
      purpose: 'Corrected field visit',
      startLocation: created.startLocation,
      routePoints: created.routePoints,
      vehicleLeaderId: created.vehicleLeaderId,
      notes: created.notes,
      etd: '00:00',
      eta: '00:01',
      status: 'SAFETY_APPROVED',
      segments: created.segments.map((segment, index) => ({
        arrivalTime: index === 0 ? '08:30' : segment.arrivalTime,
        departureTime: index === 0 ? '09:15' : segment.departureTime,
        passengerIds: segment.passengerIds,
      })),
    }),
  })
  const updated = (await response.json()).data

  assert.equal(response.status, 200)
  assert.equal(updated.status, 'PENDING_SAFETY')
  assert.equal(updated.etd, '09:15')
  assert.equal(updated.eta, '16:15')
  assert.equal(updated.purpose, 'Corrected field visit')
  assert.equal(listAuditEntries().at(-1)?.action, 'MOVEMENT_UPDATED')
})

test('rejects non-owner edits and edits after Safety review', async () => {
  const created = (await (await postMovement(validRequest())).json()).data
  const nonOwnerResponse = await fetch(`${baseUrl}/movements/${created.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-development-user-id': 'emp-002' },
    body: JSON.stringify(validRequest()),
  })
  assert.equal(nonOwnerResponse.status, 403)

  const { submitSafetyReview } = require('../src/services/safetyReviewService')
  await submitSafetyReview(created.id, { action: 'APPROVE', gpsAssignment: { type: 'NO_GPS' } }, {
    actor: users.find((user) => user.id === 'emp-002'),
  })
  const reviewedResponse = await fetch(`${baseUrl}/movements/${created.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validRequest()),
  })
  assert.equal(reviewedResponse.status, 409)
})

test('applies the employee edit cutoff before and at the configured boundary', async () => {
  const actor = users.find((user) => user.id === 'emp-001')
  const beforeCutoff = new Date('2099-12-30T09:59:59.000Z')
  const atCutoff = new Date('2099-12-30T10:00:00.000Z')
  const created = await createMovement(validRequest(), { actor, now: beforeCutoff })

  const edited = await updateEmployeeMovement(created.id, { purpose: 'Before cutoff' }, {
    actor,
    now: beforeCutoff,
  })
  assert.equal(edited.purpose, 'Before cutoff')

  await assert.rejects(
    () => updateEmployeeMovement(created.id, { purpose: 'At cutoff' }, { actor, now: atCutoff }),
    (error) => error.statusCode === 400 && error.details.some((item) => item.field === 'movementDate'),
  )
})

test('ignores a client-supplied status and GET returns the created movement', async () => {
  const createResponse = await postMovement(validRequest({ status: 'FINAL_APPROVED' }))
  const created = (await createResponse.json()).data
  const getResponse = await fetch(`${baseUrl}/movements/${created.id}`)
  const fetched = (await getResponse.json()).data

  assert.equal(createResponse.status, 201)
  assert.equal(created.status, 'PENDING_SAFETY')
  assert.equal(getResponse.status, 200)
  assert.deepEqual(fetched, created)
})

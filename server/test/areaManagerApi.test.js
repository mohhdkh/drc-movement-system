const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { after, before, beforeEach, test } = require('node:test')
const app = require('../src/app')
const { resetMovements } = require('../src/data/movementStore')
const { OFFICIAL_HEADERS, OFFICIAL_SHEETS } = require('../src/services/movementPlanWorkbook')
const { createMovementWorkbookFixture } = require('../test-support/movementWorkbookFixture')

let server
let baseUrl
let fixtureDirectory

before(async () => {
  fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'movement-workbook-api-'))
  process.env.MOVEMENT_PLAN_TEMPLATE_PATH = path.join(fixtureDirectory, 'synthetic-template.xlsm')
  await createMovementWorkbookFixture(process.env.MOVEMENT_PLAN_TEMPLATE_PATH, {
    sheets: OFFICIAL_SHEETS,
    headers: OFFICIAL_HEADERS,
  })
  await new Promise((resolve) => {
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
  delete process.env.MOVEMENT_PLAN_TEMPLATE_PATH
  fs.rmSync(fixtureDirectory, { recursive: true, force: true })
})

beforeEach(() => {
  resetMovements()
})

function movementRequest(overrides = {}) {
  return {
    requesterId: 'emp-001',
    movementDate: '2099-12-31',
    purpose: 'Area Manager review test',
    etd: '09:00',
    eta: '12:00',
    startLocation: 'DRC Office Gaza',
    routePoints: ['Site A', 'Site B'],
    vehicleLeaderId: 'emp-001',
    notes: 'Phase 5 test request.',
    segments: [
      {
        arrivalTime: '09:45',
        departureTime: '10:15',
        passengerIds: ['emp-001', 'emp-002'],
      },
      {
        arrivalTime: '11:15',
        departureTime: '11:45',
        passengerIds: ['emp-001'],
      },
    ],
    ...overrides,
  }
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

async function safetyReview(id, action = 'APPROVE', overrides = {}) {
  const body = action === 'APPROVE'
    ? {
        action,
        reviewedBy: 'emp-002',
        comment: 'Approved by Safety.',
        gpsAssignment: { type: 'DEVICE', gpsDeviceId: 'gps-001' },
        ...overrides,
      }
    : {
        action,
        reviewedBy: 'emp-002',
        comment: `${action} by Safety.`,
        ...overrides,
      }

  return apiRequest(`/safety/movements/${id}/review`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

async function createSafetyApprovedMovement() {
  const movement = await createPendingMovement()
  const response = await safetyReview(movement.id)
  assert.equal(response.status, 200)
  return (await response.json()).data
}

async function createVehicleAssignedMovement() {
  const movement = await createSafetyApprovedMovement()
  const response = await apiRequest(`/supply-chain/movements/${movement.id}/assignment`, {
    method: 'PATCH',
    body: JSON.stringify({
      assignedBy: 'emp-006',
      vehicleId: 'veh-001',
      driverId: 'drv-001',
      comment: 'Vehicle and driver assigned.',
    }),
  })
  assert.equal(response.status, 200)
  return (await response.json()).data
}

async function areaManagerReview(id, decision, overrides = {}) {
  return apiRequest(`/area-manager/movements/${id}/review`, {
    method: 'PATCH',
    body: JSON.stringify({
      decision,
      comment: decision === 'REJECTED' ? 'Please reschedule the movement.' : undefined,
      ...overrides,
    }),
  })
}

test('lists only vehicle-assigned and final movements, prioritizing pending review', async () => {
  const pending = await createPendingMovement()
  const assigned = await createVehicleAssignedMovement()

  const response = await apiRequest('/area-manager/movements')
  const movements = (await response.json()).data
  const filteredResponse = await apiRequest('/area-manager/movements?status=VEHICLE_ASSIGNED')
  const filtered = (await filteredResponse.json()).data

  assert.equal(response.status, 200)
  assert.deepEqual(movements.map((movement) => movement.id), [assigned.id])
  assert.deepEqual(filtered.map((movement) => movement.id), [assigned.id])
  assert.equal((await apiRequest(`/area-manager/movements/${assigned.id}`)).status, 200)
  assert.equal((await apiRequest(`/area-manager/movements/${pending.id}`)).status, 404)
})

test('approves a vehicle-assigned movement with server-owned audit fields', async () => {
  const movement = await createVehicleAssignedMovement()
  const response = await areaManagerReview(movement.id, 'APPROVED', {
    comment: 'Approved for movement.',
    reviewedBy: 'emp-999',
    reviewedAt: '2000-01-01T00:00:00.000Z',
    status: 'FINAL_REJECTED',
  })
  const reviewed = (await response.json()).data

  assert.equal(response.status, 200)
  assert.equal(reviewed.status, 'FINAL_APPROVED')
  assert.equal(reviewed.areaManagerApproval.decision, 'APPROVED')
  assert.equal(reviewed.areaManagerApproval.reviewedBy, 'emp-004')
  assert.notEqual(reviewed.areaManagerApproval.reviewedAt, '2000-01-01T00:00:00.000Z')
  assert.equal(reviewed.areaManagerApproval.comment, 'Approved for movement.')
})

test('rejects a vehicle-assigned movement with a meaningful comment', async () => {
  const movement = await createVehicleAssignedMovement()
  const response = await areaManagerReview(movement.id, 'REJECTED')
  const reviewed = (await response.json()).data

  assert.equal(response.status, 200)
  assert.equal(reviewed.status, 'FINAL_REJECTED')
  assert.equal(reviewed.areaManagerApproval.decision, 'REJECTED')
  assert.equal(reviewed.areaManagerApproval.comment, 'Please reschedule the movement.')
})

test('requires a comment when rejecting', async () => {
  const movement = await createVehicleAssignedMovement()
  const response = await areaManagerReview(movement.id, 'REJECTED', { comment: '   ' })
  const payload = await response.json()

  assert.equal(response.status, 400)
  assert.ok(payload.errors.some((error) => error.field === 'comment'))
})

test('rejects an invalid decision', async () => {
  const movement = await createVehicleAssignedMovement()
  const response = await areaManagerReview(movement.id, 'RETURNED')
  const payload = await response.json()

  assert.equal(response.status, 400)
  assert.ok(payload.errors.some((error) => error.field === 'decision'))
})

test('returns 404 for a nonexistent movement', async () => {
  const response = await areaManagerReview('MOV-UNKNOWN', 'APPROVED')
  assert.equal(response.status, 404)
})

test('blocks Area Manager review while pending Safety', async () => {
  const movement = await createPendingMovement()
  const response = await areaManagerReview(movement.id, 'APPROVED')
  assert.equal(response.status, 409)
})

test('blocks Area Manager review before vehicle and driver assignment', async () => {
  const movement = await createSafetyApprovedMovement()
  const response = await areaManagerReview(movement.id, 'APPROVED')
  assert.equal(response.status, 409)
})

test('blocks Area Manager review after Safety rejection', async () => {
  const movement = await createPendingMovement()
  assert.equal((await safetyReview(movement.id, 'REJECT')).status, 200)

  const response = await areaManagerReview(movement.id, 'APPROVED')
  assert.equal(response.status, 409)
})

test('blocks Area Manager review after return for modification', async () => {
  const movement = await createPendingMovement()
  assert.equal((await safetyReview(movement.id, 'RETURN')).status, 200)

  const response = await areaManagerReview(movement.id, 'APPROVED')
  assert.equal(response.status, 409)
})

test('blocks a second review after final approval', async () => {
  const movement = await createVehicleAssignedMovement()
  assert.equal((await areaManagerReview(movement.id, 'APPROVED')).status, 200)

  const response = await areaManagerReview(movement.id, 'REJECTED')
  assert.equal(response.status, 409)
})

test('blocks a second review after final rejection', async () => {
  const movement = await createVehicleAssignedMovement()
  assert.equal((await areaManagerReview(movement.id, 'REJECTED')).status, 200)

  const response = await areaManagerReview(movement.id, 'APPROVED')
  assert.equal(response.status, 409)
})

test('movement creation ignores client-supplied final approval data', async () => {
  const movement = await createPendingMovement({
    status: 'FINAL_APPROVED',
    areaManagerApproval: {
      decision: 'APPROVED',
      reviewedBy: 'emp-004',
      reviewedAt: '2000-01-01T00:00:00.000Z',
      comment: 'Injected approval.',
    },
  })

  assert.equal(movement.status, 'PENDING_SAFETY')
  assert.deepEqual(movement.areaManagerApproval, {
    decision: null,
    reviewedBy: null,
    reviewedAt: null,
    comment: null,
  })
})

test('final review preserves Safety, GPS, assignment, segments, and stop times', async () => {
  const movement = await createVehicleAssignedMovement()
  const protectedData = {
    safetyReview: movement.safetyReview,
    gpsAssignment: movement.gpsAssignment,
    supplyChainAssignment: movement.supplyChainAssignment,
    segments: movement.segments,
  }
  const response = await areaManagerReview(movement.id, 'APPROVED', {
    safetyReview: { decision: 'REJECTED' },
    gpsAssignment: { type: 'NO_GPS', gpsDeviceId: null },
    supplyChainAssignment: { vehicleId: 'veh-999', driverId: 'drv-999' },
    segments: [],
  })
  const reviewed = (await response.json()).data

  assert.equal(response.status, 200)
  assert.deepEqual(reviewed.safetyReview, protectedData.safetyReview)
  assert.deepEqual(reviewed.gpsAssignment, protectedData.gpsAssignment)
  assert.deepEqual(reviewed.supplyChainAssignment, protectedData.supplyChainAssignment)
  assert.deepEqual(reviewed.segments, protectedData.segments)
  assert.equal(reviewed.segments[0].arrivalTime, '09:45')
  assert.equal(reviewed.segments[1].departureTime, '11:45')
})

test('Safety downloads the official macro-enabled workbook for a final-approved movement only', async () => {
  const movement = await createVehicleAssignedMovement()
  assert.equal((await areaManagerReview(movement.id, 'APPROVED')).status, 200)

  const response = await apiRequest(`/safety/movements/export.xlsx?movementId=${movement.id}`)
  const workbook = Buffer.from(await response.arrayBuffer())
  assert.equal(response.status, 200)
  assert.equal(
    response.headers.get('content-type'),
    'application/vnd.ms-excel.sheet.macroEnabled.12',
  )
  assert.match(response.headers.get('content-disposition'), new RegExp(movement.id))
  assert.match(response.headers.get('content-disposition'), /\.xlsm"?$/)
  assert.equal(workbook.subarray(0, 2).toString(), 'PK')

  const forbidden = await apiRequest('/safety/movements/export.xlsx', {
    headers: { 'x-development-user-id': 'emp-004' },
  })
  assert.equal(forbidden.status, 403)

  const pending = await createPendingMovement()
  const unavailable = await apiRequest(`/safety/movements/export.xlsx?movementId=${pending.id}`)
  assert.equal(unavailable.status, 404)
})

test('Safety previews WhatsApp text for a selected final-approved movement only', async () => {
  const movement = await createVehicleAssignedMovement()
  assert.equal((await areaManagerReview(movement.id, 'APPROVED')).status, 200)

  const response = await apiRequest('/safety/movements/whatsapp-preview', {
    method: 'POST',
    body: JSON.stringify({ date: movement.movementDate, movementIds: [movement.id] }),
  })
  const result = (await response.json()).data
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(result.movementIds, [movement.id])
  assert.equal(result.movementCount, 1)
  assert.match(result.text, new RegExp(`المرجع: ${movement.id}`))
  assert.match(result.text, /\*M01\*[\s\S]*\*M02\*/)
  assert.match(result.text, /وقت الوصول: 09:45/)
  assert.match(result.text, /السائق: Demo Driver One/)

  const forbidden = await apiRequest('/safety/movements/whatsapp-preview', {
    method: 'POST',
    headers: { 'x-development-user-id': 'emp-004' },
    body: JSON.stringify({ date: movement.movementDate, movementIds: [movement.id] }),
  })
  assert.equal(forbidden.status, 403)

  const pending = await createPendingMovement()
  const unavailable = await apiRequest('/safety/movements/whatsapp-preview', {
    method: 'POST',
    body: JSON.stringify({ date: pending.movementDate, movementIds: [pending.id] }),
  })
  assert.equal(unavailable.status, 400)
})

test('Safety date selection returns and combines selected movements in chronological order', async () => {
  const first = await createVehicleAssignedMovement()
  assert.equal((await areaManagerReview(first.id, 'APPROVED')).status, 200)

  const second = await createPendingMovement({
    purpose: 'Afternoon field movement',
    etd: '13:00',
    eta: '16:00',
    segments: [
      { arrivalTime: '13:45', departureTime: '14:15', passengerIds: ['emp-001', 'emp-002'] },
      { arrivalTime: '15:15', departureTime: '15:45', passengerIds: ['emp-001'] },
    ],
  })
  assert.equal((await safetyReview(second.id)).status, 200)
  const assignment = await apiRequest(`/supply-chain/movements/${second.id}/assignment`, {
    method: 'PATCH',
    body: JSON.stringify({
      assignedBy: 'emp-006',
      vehicleId: 'veh-001',
      driverId: 'drv-001',
      comment: 'Afternoon vehicle and driver assignment.',
    }),
  })
  assert.equal(assignment.status, 200)
  assert.equal((await areaManagerReview(second.id, 'APPROVED')).status, 200)

  const availableResponse = await apiRequest('/safety/movements/final-approved?date=2099-12-31')
  const available = (await availableResponse.json()).data
  assert.equal(availableResponse.status, 200)
  assert.deepEqual(available.map((movement) => movement.id), [first.id, second.id])

  const previewResponse = await apiRequest('/safety/movements/whatsapp-preview', {
    method: 'POST',
    body: JSON.stringify({ date: '2099-12-31', movementIds: [second.id, first.id] }),
  })
  const preview = (await previewResponse.json()).data
  assert.equal(previewResponse.status, 200)
  assert.equal(preview.date, '2099-12-31')
  assert.equal(preview.movementCount, 2)
  assert.deepEqual(preview.movementIds, [first.id, second.id])
  assert.ok(preview.text.indexOf(first.id) < preview.text.indexOf(second.id))
  assert.equal(preview.text.split(first.id).length - 1, 1)
  assert.equal(preview.text.split(second.id).length - 1, 1)
  assert.match(preview.text, /--------------------/)

  const wrongDate = await apiRequest('/safety/movements/whatsapp-preview', {
    method: 'POST',
    body: JSON.stringify({ date: '2099-12-30', movementIds: [first.id] }),
  })
  assert.equal(wrongDate.status, 400)

  const invalidDate = await apiRequest('/safety/movements/final-approved?date=not-a-date')
  assert.equal(invalidDate.status, 400)
})

test('WhatsApp batch backend rejects empty, duplicate, malformed, and unknown selections', async () => {
  const cases = [
    { date: '2099-12-31', movementIds: [] },
    { date: '2099-12-31', movementIds: ['MOV-DUPLICATE', 'MOV-DUPLICATE'] },
    { date: '2099-12-31', movementIds: ['not valid'] },
    { date: '2099-12-31', movementIds: ['MOV-UNKNOWN'] },
  ]

  for (const body of cases) {
    const response = await apiRequest('/safety/movements/whatsapp-preview', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    assert.equal(response.status, 400)
  }
})

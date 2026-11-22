const assert = require('node:assert/strict')
const test = require('node:test')
const { formatWhatsAppMovement } = require('../src/services/whatsAppMovementFormatter')
const { mapWhatsAppMovement } = require('../src/services/whatsAppMovementMapper')

function movement(overrides = {}) {
  return {
    id: 'MOV-WHATSAPP01',
    movementDate: '2026-10-18',
    purpose: 'Field distribution',
    etd: '08:00',
    vehicleLeaderId: 'emp-leader',
    status: 'FINAL_APPROVED',
    segments: Array.from({ length: 4 }, (_, index) => ({
      id: `segment-${index + 1}`,
      sequence: index + 1,
      code: `M0${index + 1}`,
      fromLocation: index === 0 ? 'Office' : `Site ${index}`,
      toLocation: index === 3 ? 'Office' : `Site ${index + 1}`,
      arrivalTime: `${10 + index}:00`,
      departureTime: `${10 + index}:30`,
      passengerIds: index === 0 ? ['emp-one', 'emp-leader'] : ['emp-leader'],
    })),
    gpsAssignment: { type: 'DEVICE', gpsDeviceId: 'gps-1' },
    supplyChainAssignment: { vehicleId: 'vehicle-1', driverId: 'driver-1' },
    ...overrides,
  }
}

const resources = {
  users: [
    { id: 'emp-one', name: 'Employee One', phone: '+000000000001' },
    { id: 'emp-leader', name: 'Vehicle Leader', phone: '+000000000002' },
  ],
  locations: [
    { name: 'Office', latitude: 31.5017, longitude: 34.4668 },
    { name: 'Site 1', latitude: 31.51, longitude: 34.47 },
    { name: 'Site 2', latitude: null, longitude: null },
    { name: 'Site 3', latitude: 31.53, longitude: 34.49 },
  ],
  vehicles: [{ id: 'vehicle-1', code: 'DRC001' }],
  drivers: [{ id: 'driver-1', name: 'Driver Name', phone: '+000000000003' }],
  gpsDevices: [{ id: 'gps-1', code: 'GPS-01' }],
}

function map(overrides = {}) {
  return mapWhatsAppMovement({
    movements: [movement(overrides)],
    movementId: 'MOV-WHATSAPP01',
    ...resources,
  })
}

test('maps and formats any number of persisted stops in chronological order', () => {
  const mapped = map()
  const text = formatWhatsAppMovement(mapped)

  assert.equal(mapped.segments.length, 4)
  assert.equal(mapped.passengers.length, 2)
  assert.equal(mapped.paxCount, 3)
  assert.deepEqual(mapped.segments.map((segment) => segment.code), ['M01', 'M02', 'M03', 'M04'])
  assert.ok(text.indexOf('*M01*') < text.indexOf('*M04*'))
  assert.match(text, /المرجع: MOV-WHATSAPP01/)
  assert.match(text, /المركبة: DRC001/)
  assert.match(text, /السائق: Driver Name - \+000000000003/)
  assert.match(text, /Employee One - \+000000000001/)
  assert.match(text, /قائد المركبة: Vehicle Leader - \+000000000002/)
  assert.match(text, /إحداثيات الانطلاق: 31\.5017, 34\.4668/)
  assert.match(text, /وقت الوصول: 13:00/)
  assert.match(text, /وقت المغادرة: 13:30/)
  assert.match(text, /معتمد نهائياً \(FINAL_APPROVED\)/)
})

test('omits missing optional phones, coordinates, and stop times without inventing values', () => {
  const mapped = map({
    segments: [{
      id: 'segment-1', sequence: 1, code: 'M01', fromLocation: 'Unknown A',
      toLocation: 'Unknown B', arrivalTime: null, departureTime: null,
      passengerIds: ['emp-one', 'emp-leader'],
    }],
    gpsAssignment: { type: 'NO_GPS', gpsDeviceId: null },
  })
  mapped.driver.phone = null
  mapped.passengers.forEach((passenger) => { passenger.phone = null })
  mapped.vehicleLeader.phone = null
  const text = formatWhatsAppMovement(mapped)

  assert.match(text, /جهاز GPS: بدون جهاز GPS/)
  assert.doesNotMatch(text, /إحداثيات/)
  assert.doesNotMatch(text, /وقت الوصول|وقت المغادرة/)
  assert.doesNotMatch(text, /\+000/)
})

test('filters out movements that are not FINAL_APPROVED', () => {
  assert.throws(
    () => mapWhatsAppMovement({
      movements: [movement({ status: 'VEHICLE_ASSIGNED' })],
      movementId: 'MOV-WHATSAPP01',
      ...resources,
    }),
    { code: 'WHATSAPP_MOVEMENT_NOT_FOUND', statusCode: 404 },
  )
})

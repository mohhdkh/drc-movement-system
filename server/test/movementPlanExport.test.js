const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const JSZip = require('jszip')
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom')
const { mapMovementPlanRows } = require('../src/services/movementPlanMapper')
const {
  DATA_COLUMNS,
  OFFICIAL_HEADERS,
  OFFICIAL_SHEETS,
  renderMovementPlanWorkbook,
  sha256,
} = require('../src/services/movementPlanWorkbook')

const XML_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PACKAGE_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'
const templatePath = path.resolve(__dirname, '../../doc/Movement_Tracker_LIVE (1).xlsm')
const inspectedVbaHash = 'ac63a7161979ce5f55d220034a3c0e4f634319709f91cc951f20e6c9f04fde99'

function movement(overrides = {}) {
  return {
    id: 'MOV-EXPORT01',
    movementDate: '2026-10-18',
    purpose: 'Visit to a GSK distribution point SG',
    etd: '08:00',
    eta: '17:00',
    notes: 'Persisted operational note',
    vehicleLeaderId: 'emp-leader',
    status: 'FINAL_APPROVED',
    segments: [
      { sequence: 1, code: 'M01', fromLocation: 'Office', toLocation: 'Site A', arrivalTime: '09:00', departureTime: '09:30', passengerIds: ['emp-one', 'emp-leader'] },
      { sequence: 2, code: 'M02', fromLocation: 'Site A', toLocation: 'Site B', arrivalTime: '10:30', departureTime: '11:00', passengerIds: ['emp-leader'] },
      { sequence: 3, code: 'M03', fromLocation: 'Site B', toLocation: 'Site C', arrivalTime: '12:00', departureTime: '12:30', passengerIds: ['emp-two', 'emp-leader'] },
      { sequence: 4, code: 'M04', fromLocation: 'Site C', toLocation: 'Office', arrivalTime: '16:30', departureTime: '16:45', passengerIds: ['emp-leader'] },
    ],
    gpsAssignment: { type: 'DEVICE', gpsDeviceId: 'gps-1' },
    supplyChainAssignment: { vehicleId: 'vehicle-1', driverId: 'driver-1' },
    areaManagerApproval: { reviewedBy: 'emp-reviewer' },
    ...overrides,
  }
}

const resources = {
  users: [
    { id: 'emp-one', name: 'Employee One', phone: '+9701' },
    { id: 'emp-two', name: 'Employee Two', phone: null },
    { id: 'emp-three', name: 'Employee Three', phone: null },
    { id: 'emp-four', name: 'Employee Four', phone: null },
    { id: 'emp-five', name: 'Employee Five', phone: null },
    { id: 'emp-six', name: 'Employee Six', phone: null },
    { id: 'emp-leader', name: 'Vehicle Leader', phone: '+9700' },
    { id: 'emp-reviewer', name: 'Final Reviewer', phone: null },
  ],
  locations: [
    { id: 'loc-office', name: 'Office', latitude: 31.5017, longitude: 34.4668 },
    { id: 'loc-a', name: 'Site A', latitude: 31.51, longitude: 34.47 },
    { id: 'loc-b', name: 'Site B', latitude: 31.52, longitude: 34.48 },
    { id: 'loc-c', name: 'Site C', latitude: null, longitude: null },
  ],
  vehicles: [{ id: 'vehicle-1', code: 'DRC001', model: 'Toyota Prado', plateNumber: 'DRC-001' }],
  drivers: [{ id: 'driver-1', name: 'Driver Name' }],
  gpsDevices: [{ id: 'gps-1', code: 'GPS-01', label: 'Garmin GPS 01' }],
}

function mapRows(movements, options = {}) {
  return mapMovementPlanRows({ movements, ...resources, ...options })
}

function xml(value) {
  return new DOMParser().parseFromString(value, 'application/xml')
}

function elements(node, name, namespace = XML_NS) {
  return Array.from(node.getElementsByTagNameNS(namespace, name))
}

function column(reference) {
  return String(reference || '').replace(/\d+$/, '')
}

function cellText(cell, strings = []) {
  if (!cell) return ''
  if (cell.getAttribute('t') === 's') {
    const index = Number(elements(cell, 'v')[0]?.textContent)
    return strings[index] || ''
  }
  return elements(cell, 't').map((node) => node.textContent).join('') ||
    elements(cell, 'v')[0]?.textContent || ''
}

function sharedStrings(document) {
  return elements(document, 'si').map((item) => (
    elements(item, 't').map((text) => text.textContent).join('')
  ))
}

function cellAt(document, address) {
  return elements(document, 'c').find((cell) => cell.getAttribute('r') === address)
}

async function worksheetPart(zip, sheetName) {
  const workbook = xml(await zip.file('xl/workbook.xml').async('string'))
  const relationships = xml(await zip.file('xl/_rels/workbook.xml.rels').async('string'))
  const sheet = elements(workbook, 'sheet').find((item) => item.getAttribute('name') === sheetName)
  const relationshipId = sheet.getAttributeNS(REL_NS, 'id') || sheet.getAttribute('r:id')
  const relationship = elements(relationships, 'Relationship', PACKAGE_REL_NS)
    .find((item) => item.getAttribute('Id') === relationshipId)
  return `xl/${relationship.getAttribute('Target')}`
}

function formulasOutsideExportCells(document) {
  const dataColumns = new Set(DATA_COLUMNS)
  return elements(document, 'c').flatMap((cell) => {
    const formula = elements(cell, 'f')[0]
    if (!formula) return []
    const reference = cell.getAttribute('r')
    const row = Number(reference.replace(/\D/g, ''))
    if (row >= 4 && row <= 5999 && dataColumns.has(column(reference))) return []
    return [[reference, formula.toString()]]
  })
}

test('maps final-approved plans and segments into the provider-neutral official model', () => {
  const rows = mapRows([
    movement(),
    movement({ id: 'MOV-REJECTED', status: 'FINAL_REJECTED' }),
  ])

  assert.equal(rows.length, 4)
  assert.deepEqual(rows.map((row) => row.planNumber), ['P01', 'P01', 'P01', 'P01'])
  assert.deepEqual(rows.map((row) => row.segmentNumber), ['M01', 'M02', 'M03', 'M04'])
  assert.deepEqual(rows.map((row) => row.departureTime), ['08:00', '09:30', '11:00', '12:30'])
  assert.deepEqual(rows.map((row) => row.arrivalTime), ['09:00', '10:30', '12:00', '16:30'])
  assert.equal(rows[0].leadPassenger, 'Vehicle Leader')
  assert.deepEqual(rows[0].otherPassengers, ['Employee One'])
  assert.equal(rows[0].passengerCount, 3)
  assert.equal(rows[0].driver, 'Driver Name')
  assert.equal(rows[0].vehicleCode, 'DRC001')
  assert.equal(rows[0].vehicleModel, 'Toyota Prado')
  assert.equal(rows[0].plateNumber, 'DRC-001')
  assert.equal(rows[0].gpsDevice, 'GPS-01')
  assert.equal(rows[0].imei, '')
  assert.equal(rows[0].validatedBy, 'Final Reviewer')
  assert.equal(rows[0].validationStatus, 'YES')
  assert.equal(rows[0].fromLatitude, 31.5017)
  assert.equal(rows[2].toLatitude, null)
})

test('numbers plans deterministically and restarts M numbering for every plan', () => {
  const rows = mapRows([
    movement({ id: 'MOV-LATER', movementDate: '2026-10-19', segments: movement().segments.slice(0, 2) }),
    movement({ id: 'MOV-EARLIER', segments: movement().segments.slice(0, 3) }),
  ])

  assert.deepEqual(rows.map((row) => row.planNumber), ['P01', 'P01', 'P01', 'P02', 'P02'])
  assert.deepEqual(rows.map((row) => row.segmentNumber), ['M01', 'M02', 'M03', 'M01', 'M02'])
  assert.deepEqual([...new Set(rows.map((row) => row.movementId))], ['MOV-EARLIER', 'MOV-LATER'])
})

test('preserves passenger overflow in Notes and leaves unsupported optional fields blank', () => {
  const passengerIds = [
    'emp-leader', 'emp-one', 'emp-two', 'emp-three', 'emp-four', 'emp-five', 'emp-six',
  ]
  const rows = mapRows([movement({
    gpsAssignment: { type: 'NO_GPS', gpsDeviceId: null },
    segments: [{
      sequence: 1,
      code: 'M01',
      fromLocation: 'Office',
      toLocation: 'Site C',
      arrivalTime: '09:00',
      departureTime: '09:30',
      passengerIds,
    }],
  })])

  assert.equal(rows[0].passengerCount, 8)
  assert.equal(rows[0].leadPassenger, 'Vehicle Leader')
  assert.deepEqual(rows[0].otherPassengers, [
    'Employee One', 'Employee Two', 'Employee Three', 'Employee Four', 'Employee Five',
  ])
  assert.deepEqual(rows[0].overflowPassengers.map((passenger) => passenger.name), ['Employee Six'])
  assert.match(rows[0].notes, /PAX_MANIFEST \| pax=Vehicle Leader \(\+9700\); Employee One \(\+9701\)/)
  assert.match(rows[0].notes, /EXTRA_PAX_COUNT=1/)
  assert.equal(rows[0].gpsDevice, '')
  assert.equal(rows[0].imei, '')
  assert.equal(rows[0].visualMarker, '')
  assert.equal(rows[0].riskLevel, '')
  assert.equal(rows[0].arrived, '')
})

test('rejects a requested movement unless it is final approved', () => {
  assert.throws(
    () => mapRows([movement({ status: 'VEHICLE_ASSIGNED' })], { movementId: 'MOV-EXPORT01' }),
    { code: 'MOVEMENT_PLAN_NOT_FOUND', statusCode: 404 },
  )
})

test('rejects exports that exceed the official P01-P50 plan limit', () => {
  const movements = Array.from({ length: 51 }, (_, index) => movement({
    id: `MOV-LIMIT-${String(index + 1).padStart(2, '0')}`,
    segments: movement().segments.slice(0, 1),
  }))
  assert.throws(
    () => mapRows(movements),
    { code: 'MOVEMENT_PLAN_WORKBOOK_LIMIT', statusCode: 409 },
  )
})

test('renders the official XLSM and preserves every package part except Movement Tracker', async () => {
  const rows = mapRows([movement()])
  const source = await JSZip.loadAsync(require('node:fs').readFileSync(templatePath))
  const workbook = await renderMovementPlanWorkbook({ templatePath, rows })
  const output = await JSZip.loadAsync(workbook)
  const targetPart = await worksheetPart(source, 'Movement Tracker')

  assert.equal(workbook.subarray(0, 2).toString(), 'PK')
  assert.match(
    await output.file('[Content_Types].xml').async('string'),
    /application\/vnd\.ms-excel\.sheet\.macroEnabled\.main\+xml/,
  )
  assert.equal(sha256(await source.file('xl/vbaProject.bin').async('nodebuffer')), inspectedVbaHash)
  assert.equal(sha256(await output.file('xl/vbaProject.bin').async('nodebuffer')), inspectedVbaHash)
  assert.deepEqual(Object.keys(output.files).sort(), Object.keys(source.files).sort())

  for (const name of Object.keys(source.files)) {
    if (name === targetPart || source.files[name].dir) continue
    const [before, after] = await Promise.all([
      source.file(name).async('nodebuffer'),
      output.file(name).async('nodebuffer'),
    ])
    assert.equal(sha256(after), sha256(before), `${name} changed unexpectedly`)
  }

  const outputWorkbook = xml(await output.file('xl/workbook.xml').async('string'))
  assert.deepEqual(
    elements(outputWorkbook, 'sheet').map((sheet) => sheet.getAttribute('name')),
    OFFICIAL_SHEETS,
  )
})

test('populates Movement Tracker columns and preserves formulas outside export cells', async () => {
  const rows = mapRows([movement()])
  const source = await JSZip.loadAsync(require('node:fs').readFileSync(templatePath))
  const workbook = await renderMovementPlanWorkbook({ templatePath, rows })
  const output = await JSZip.loadAsync(workbook)
  const targetPart = await worksheetPart(source, 'Movement Tracker')
  const sourceSheet = xml(await source.file(targetPart).async('string'))
  const outputSheet = xml(await output.file(targetPart).async('string'))
  const strings = sharedStrings(xml(await source.file('xl/sharedStrings.xml').async('string')))

  assert.deepEqual(
    OFFICIAL_HEADERS.map((_, index) => cellText(cellAt(outputSheet, `${columnName(index)}2`), strings)),
    OFFICIAL_HEADERS,
  )
  assert.equal(cellText(cellAt(outputSheet, 'A4')), '46313')
  assert.equal(cellText(cellAt(outputSheet, 'B4')), 'P01')
  assert.equal(cellText(cellAt(outputSheet, 'C4')), 'M01')
  assert.equal(cellText(cellAt(outputSheet, 'D4')), '3')
  assert.equal(cellText(cellAt(outputSheet, 'E4')), 'P01-20261018-DIS-DRC001-M01-PAX03')
  assert.equal(cellText(cellAt(outputSheet, 'F4')), 'Visit to a GSK distribution point SG')
  assert.equal(cellText(cellAt(outputSheet, 'G4')), 'Vehicle Leader')
  assert.equal(cellText(cellAt(outputSheet, 'H4')), 'Employee One')
  assert.equal(cellText(cellAt(outputSheet, 'M4')), 'Driver Name')
  assert.equal(cellText(cellAt(outputSheet, 'N4')), 'DRC001')
  assert.equal(cellText(cellAt(outputSheet, 'P4')), 'Toyota Prado')
  assert.equal(cellText(cellAt(outputSheet, 'Q4')), 'DRC-001')
  assert.equal(cellText(cellAt(outputSheet, 'R4')), 'GPS-01')
  assert.equal(cellText(cellAt(outputSheet, 'T4')), 'Office')
  assert.equal(cellText(cellAt(outputSheet, 'U4')), '31.5017')
  assert.equal(cellText(cellAt(outputSheet, 'W4')), 'Site A')
  assert.equal(cellText(cellAt(outputSheet, 'Z4')), '08:00')
  assert.equal(cellText(cellAt(outputSheet, 'AA4')), '09:00')
  assert.equal(cellText(cellAt(outputSheet, 'AC4')), 'Final Reviewer')
  assert.equal(cellText(cellAt(outputSheet, 'AD4')), 'YES')
  assert.equal(cellText(cellAt(outputSheet, 'AF4')), 'Persisted operational note')
  assert.equal(cellText(cellAt(outputSheet, 'BN4')), '20261018|P01')
  assert.match(cellText(cellAt(outputSheet, 'BO4')), /^M01 \| 08:00–09:00 \| Office/)
  assert.match(cellText(cellAt(outputSheet, 'BP7')), /M01[\s\S]*M04/)
  assert.deepEqual(formulasOutsideExportCells(outputSheet), formulasOutsideExportCells(sourceSheet))

  const serializer = new XMLSerializer()
  for (const nodeName of ['cols', 'mergeCells', 'dataValidations', 'conditionalFormatting', 'controls']) {
    assert.deepEqual(
      elements(outputSheet, nodeName).map((node) => serializer.serializeToString(node)),
      elements(sourceSheet, nodeName).map((node) => serializer.serializeToString(node)),
      `${nodeName} changed unexpectedly`,
    )
  }
})

test('writes formula-like persisted values as inert text', async () => {
  const rows = mapRows([movement({ purpose: '=HYPERLINK("https://example.invalid")' })])
  const workbook = await renderMovementPlanWorkbook({ templatePath, rows })
  const output = await JSZip.loadAsync(workbook)
  const targetPart = await worksheetPart(output, 'Movement Tracker')
  const sheet = xml(await output.file(targetPart).async('string'))
  const purposeCell = cellAt(sheet, 'F4')

  assert.equal(purposeCell.getAttribute('t'), 'inlineStr')
  assert.equal(elements(purposeCell, 'f').length, 0)
  assert.equal(cellText(purposeCell), '=HYPERLINK("https://example.invalid")')
  assert.match(cellText(cellAt(sheet, 'E4')), /-UNK-/)
})

function columnName(index) {
  let value = index + 1
  let name = ''
  while (value) {
    const remainder = (value - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    value = Math.floor((value - 1) / 26)
  }
  return name
}

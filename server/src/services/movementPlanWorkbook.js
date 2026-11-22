const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')
const JSZip = require('jszip')
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom')

const SPREADSHEET_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const OFFICE_REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PACKAGE_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'
const XML_NS = 'http://www.w3.org/XML/1998/namespace'
const VBA_PART = 'xl/vbaProject.bin'
const TARGET_SHEET = 'Movement Tracker'
const DATA_START_ROW = 4
const DATA_END_ROW = 5999

const OFFICIAL_SHEETS = [
  'Staff Requests',
  'Plan Management',
  'Movement Tracker',
  'Locations',
  'Staff',
  'Drivers',
  'Vehicles',
  'GPS_Devices',
  'Purpose',
  'Validation_Status',
  'Risk_Levels',
  'Time_5min',
  '_Validation_Lists',
  'Plan Summary',
  'Transfer Audit',
]

const OFFICIAL_HEADERS = [
  'DATE',
  'PLAN #',
  'MOVEMENT #',
  'PAX COUNT',
  'CODE',
  'PURPOSE',
  'LEAD (PAX 1)',
  'PAX 2',
  'PAX 3',
  'PAX 4',
  'PAX 5',
  'PAX 6',
  'DRIVER',
  'DRC VEHICLE CODE',
  'VISUAL MARKER',
  'VEHICLE MODEL',
  'PLATE #',
  'GARMIN DEVICE',
  'IMEI',
  'DEPARTURE SITE',
  'DEP LAT',
  'DEP LON',
  'DESTINATION',
  'DEST LAT',
  'DEST LON',
  'DEP TIME',
  'ARR TIME',
  'RISK LEVEL',
  'VALIDATED BY',
  'VAL STATUS',
  'ARRIVED',
  'NOTES',
]

const DATA_COLUMNS = [
  ...OFFICIAL_HEADERS.map((_, index) => columnName(index)),
  'AG',
  'BN',
  'BO',
  'BP',
]
const DATA_COLUMN_SET = new Set(DATA_COLUMNS)

function elements(node, namespace, localName) {
  return Array.from(node.getElementsByTagNameNS(namespace, localName))
}

function parseXml(value, partName) {
  const errors = []
  const document = new DOMParser({
    onError(level, message) {
      if (level !== 'warning') errors.push(message)
    },
  }).parseFromString(value.replace(/^\uFEFF/, ''), 'application/xml')
  if (errors.length || document.documentElement.localName === 'parsererror') {
    throw new Error(`Official movement workbook contains invalid XML in ${partName}.`)
  }
  return document
}

function resolvePart(basePart, target) {
  if (target.startsWith('/')) return target.slice(1)
  return path.posix.normalize(path.posix.join(path.posix.dirname(basePart), target))
}

function relationshipPart(partName) {
  return path.posix.join(path.posix.dirname(partName), '_rels', `${path.posix.basename(partName)}.rels`)
}

async function relationshipIndex(zip, sourcePart) {
  const relationshipsPath = relationshipPart(sourcePart)
  const file = zip.file(relationshipsPath)
  if (!file) throw new Error(`Official movement workbook is missing ${relationshipsPath}.`)
  const document = parseXml(await file.async('string'), relationshipsPath)
  return new Map(elements(document, PACKAGE_REL_NS, 'Relationship').map((relationship) => [
    relationship.getAttribute('Id'),
    {
      target: resolvePart(sourcePart, relationship.getAttribute('Target')),
      type: relationship.getAttribute('Type'),
    },
  ]))
}

async function workbookContext(zip) {
  const workbookPart = 'xl/workbook.xml'
  const workbookFile = zip.file(workbookPart)
  if (!workbookFile) throw new Error('Official movement workbook is missing xl/workbook.xml.')
  const document = parseXml(await workbookFile.async('string'), workbookPart)
  const relationships = await relationshipIndex(zip, workbookPart)
  const sheets = elements(document, SPREADSHEET_NS, 'sheet').map((sheet) => {
    const relationshipId = sheet.getAttributeNS(OFFICE_REL_NS, 'id') || sheet.getAttribute('r:id')
    return {
      name: sheet.getAttribute('name'),
      relationshipId,
      part: relationships.get(relationshipId)?.target,
    }
  })
  if (sheets.map((sheet) => sheet.name).join('\n') !== OFFICIAL_SHEETS.join('\n')) {
    throw new Error('Official movement workbook sheet names or order do not match the inspected template.')
  }
  const target = sheets.find((sheet) => sheet.name === TARGET_SHEET)
  if (!target?.part || !zip.file(target.part)) {
    throw new Error(`Official movement workbook is missing the ${TARGET_SHEET} worksheet relationship.`)
  }
  return { sheets, target }
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

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

function columnIndex(name) {
  return Array.from(name).reduce((total, character) => total * 26 + character.charCodeAt(0) - 64, 0)
}

function cellColumn(reference) {
  return String(reference || '').replace(/\d+$/, '')
}

function findCell(row, column) {
  return elements(row, SPREADSHEET_NS, 'c')
    .find((cell) => cellColumn(cell.getAttribute('r')) === column)
}

function sharedStrings(document) {
  if (!document) return []
  return elements(document, SPREADSHEET_NS, 'si').map((item) => (
    elements(item, SPREADSHEET_NS, 't').map((text) => text.textContent).join('')
  ))
}

function cellText(cell, strings) {
  if (!cell) return ''
  if (cell.getAttribute('t') === 's') {
    const value = elements(cell, SPREADSHEET_NS, 'v')[0]?.textContent
    return value == null ? '' : strings[Number(value)] || ''
  }
  return elements(cell, SPREADSHEET_NS, 't').map((text) => text.textContent).join('') ||
    elements(cell, SPREADSHEET_NS, 'v')[0]?.textContent || ''
}

function clearCell(cell) {
  while (cell.firstChild) cell.removeChild(cell.firstChild)
  cell.removeAttribute('t')
}

function getOrCreateCell(document, row, rowNumber, column, styleByColumn) {
  const existing = findCell(row, column)
  if (existing) return existing
  const cell = document.createElementNS(SPREADSHEET_NS, 'x:c')
  cell.setAttribute('r', `${column}${rowNumber}`)
  const style = styleByColumn.get(column)
  if (style) cell.setAttribute('s', style)
  const nextCell = elements(row, SPREADSHEET_NS, 'c')
    .find((candidate) => columnIndex(cellColumn(candidate.getAttribute('r'))) > columnIndex(column))
  row.insertBefore(cell, nextCell || null)
  return cell
}

function sanitizeXmlText(value) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
}

function setText(document, cell, value) {
  clearCell(cell)
  const safeValue = sanitizeXmlText(value)
  if (!safeValue) return
  if (safeValue.length > 32767) {
    throw new Error(`Movement Tracker cell ${cell.getAttribute('r')} exceeds Excel's text limit.`)
  }
  cell.setAttribute('t', 'inlineStr')
  const inlineString = document.createElementNS(SPREADSHEET_NS, 'x:is')
  const text = document.createElementNS(SPREADSHEET_NS, 'x:t')
  text.setAttributeNS(XML_NS, 'xml:space', 'preserve')
  text.appendChild(document.createTextNode(safeValue))
  inlineString.appendChild(text)
  cell.appendChild(inlineString)
}

function setNumber(document, cell, value) {
  clearCell(cell)
  if (value == null || value === '' || !Number.isFinite(Number(value))) return
  const numericValue = document.createElementNS(SPREADSHEET_NS, 'x:v')
  numericValue.appendChild(document.createTextNode(String(Number(value))))
  cell.appendChild(numericValue)
}

function excelDateSerial(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) throw new Error(`Movement date ${value} is not a valid date-only value.`)
  return (Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) -
    Date.UTC(1899, 11, 30)) / 86400000
}

function compactDate(value) {
  return String(value || '').replaceAll('-', '')
}

function locationLine(name, latitude, longitude) {
  if (latitude == null || longitude == null) return name
  return `${name}, ${Number(latitude).toFixed(6)}, ${Number(longitude).toFixed(6)}`
}

function movementLine(row) {
  const time = row.departureTime && row.arrivalTime
    ? `${row.departureTime}–${row.arrivalTime}`
    : row.departureTime || row.arrivalTime || ''
  return [
    row.segmentNumber,
    time,
    `${locationLine(row.fromLocation, row.fromLatitude, row.fromLongitude)} → ${locationLine(row.toLocation, row.toLatitude, row.toLongitude)}`,
  ].filter(Boolean).join(' | ')
}

function movementCode(row, purposeCodes) {
  const purposeCode = purposeCodes.get(String(row.purpose || '').trim().toLowerCase()) || 'UNK'
  const vehicleCode = row.vehicleCode || 'VEHUNK'
  return `${row.planNumber}-${compactDate(row.movementDate)}-${purposeCode}-${vehicleCode}-${row.segmentNumber}-PAX${String(row.passengerCount).padStart(2, '0')}`
}

function rowValues(row, purposeCodes) {
  return [
    { number: excelDateSerial(row.movementDate) },
    row.planNumber,
    row.segmentNumber,
    { number: row.passengerCount },
    movementCode(row, purposeCodes),
    row.purpose,
    row.leadPassenger,
    ...Array.from({ length: 5 }, (_, index) => row.otherPassengers[index] || ''),
    row.driver,
    row.vehicleCode,
    row.visualMarker,
    row.vehicleModel,
    row.plateNumber,
    row.gpsDevice,
    row.imei,
    row.fromLocation,
    { number: row.fromLatitude },
    { number: row.fromLongitude },
    row.toLocation,
    { number: row.toLatitude },
    { number: row.toLongitude },
    row.departureTime,
    row.arrivalTime,
    row.riskLevel,
    row.validatedBy,
    row.validationStatus,
    row.arrived,
    row.notes,
  ]
}

async function loadSharedStrings(zip) {
  const part = 'xl/sharedStrings.xml'
  const file = zip.file(part)
  return file ? sharedStrings(parseXml(await file.async('string'), part)) : []
}

async function loadPurposeCodes(zip, context, strings) {
  const purposeSheet = context.sheets.find((sheet) => sheet.name === 'Purpose')
  const file = purposeSheet?.part && zip.file(purposeSheet.part)
  if (!file) throw new Error('Official movement workbook is missing the Purpose worksheet.')
  const document = parseXml(await file.async('string'), purposeSheet.part)
  const rows = elements(document, SPREADSHEET_NS, 'row')
  const codes = new Map()
  for (const row of rows) {
    if (Number(row.getAttribute('r')) < 2) continue
    const purpose = cellText(findCell(row, 'A'), strings).trim()
    const code = cellText(findCell(row, 'B'), strings).trim()
    if (purpose && code) codes.set(purpose.toLowerCase(), code)
  }
  return codes
}

function verifyHeaders(document, strings) {
  const headerRow = elements(document, SPREADSHEET_NS, 'row')
    .find((row) => row.getAttribute('r') === '2')
  const actual = OFFICIAL_HEADERS.map((_, index) => cellText(findCell(headerRow, columnName(index)), strings))
  if (actual.join('\n') !== OFFICIAL_HEADERS.join('\n')) {
    throw new Error('Movement Tracker headers do not match the inspected official workbook.')
  }
}

function populateMovementTracker(document, rows, purposeCodes) {
  const sheetData = elements(document, SPREADSHEET_NS, 'sheetData')[0]
  if (!sheetData) throw new Error('Movement Tracker is missing sheetData.')
  const worksheetRows = elements(sheetData, SPREADSHEET_NS, 'row')
  const rowIndex = new Map(worksheetRows.map((row) => [Number(row.getAttribute('r')), row]))
  const prototype = rowIndex.get(DATA_START_ROW)
  if (!prototype) throw new Error('Movement Tracker is missing the official archive prototype row 4.')
  const styleByColumn = new Map(elements(prototype, SPREADSHEET_NS, 'c').map((cell) => [
    cellColumn(cell.getAttribute('r')),
    cell.getAttribute('s'),
  ]))

  for (const row of worksheetRows) {
    const rowNumber = Number(row.getAttribute('r'))
    if (rowNumber < DATA_START_ROW || rowNumber > DATA_END_ROW) continue
    for (const cell of elements(row, SPREADSHEET_NS, 'c')) {
      if (DATA_COLUMN_SET.has(cellColumn(cell.getAttribute('r')))) clearCell(cell)
    }
  }

  const runningPlans = new Map()
  rows.forEach((data, index) => {
    const rowNumber = DATA_START_ROW + index
    let row = rowIndex.get(rowNumber)
    if (!row) {
      row = document.createElementNS(SPREADSHEET_NS, 'x:row')
      row.setAttribute('r', String(rowNumber))
      const nextRow = worksheetRows.find((candidate) => Number(candidate.getAttribute('r')) > rowNumber)
      sheetData.insertBefore(row, nextRow || null)
      rowIndex.set(rowNumber, row)
    }
    row.removeAttribute('hidden')

    rowValues(data, purposeCodes).forEach((value, columnOffset) => {
      const column = columnName(columnOffset)
      const cell = getOrCreateCell(document, row, rowNumber, column, styleByColumn)
      if (value && typeof value === 'object' && Object.hasOwn(value, 'number')) {
        setNumber(document, cell, value.number)
      } else {
        setText(document, cell, value)
      }
    })
    setText(document, getOrCreateCell(document, row, rowNumber, 'AG', styleByColumn), '')

    const key = `${compactDate(data.movementDate)}|${data.planNumber}`
    const line = movementLine(data)
    const running = runningPlans.has(key) ? `${runningPlans.get(key)}\n${line}` : line
    runningPlans.set(key, running)
    setText(document, getOrCreateCell(document, row, rowNumber, 'BN', styleByColumn), key)
    setText(document, getOrCreateCell(document, row, rowNumber, 'BO', styleByColumn), line)
    setText(document, getOrCreateCell(document, row, rowNumber, 'BP', styleByColumn), running)
  })
}

async function renderMovementPlanWorkbook({ templatePath, rows }) {
  const sourceBuffer = await fs.readFile(templatePath)
  const zip = await JSZip.loadAsync(sourceBuffer)
  const contentTypes = await zip.file('[Content_Types].xml')?.async('string')
  if (!contentTypes?.includes('application/vnd.ms-excel.sheet.macroEnabled.main+xml')) {
    throw new Error('Official movement workbook is not a macro-enabled XLSM package.')
  }
  const sourceVba = await zip.file(VBA_PART)?.async('nodebuffer')
  if (!sourceVba) throw new Error(`Official movement workbook is missing ${VBA_PART}.`)

  const context = await workbookContext(zip)
  const strings = await loadSharedStrings(zip)
  const purposeCodes = await loadPurposeCodes(zip, context, strings)
  const worksheetFile = zip.file(context.target.part)
  const worksheetDocument = parseXml(await worksheetFile.async('string'), context.target.part)
  verifyHeaders(worksheetDocument, strings)
  populateMovementTracker(worksheetDocument, rows, purposeCodes)

  zip.file(
    context.target.part,
    new XMLSerializer().serializeToString(worksheetDocument),
    { createFolders: false },
  )
  const output = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
  const outputZip = await JSZip.loadAsync(output)
  const outputVba = await outputZip.file(VBA_PART)?.async('nodebuffer')
  if (!outputVba || sha256(outputVba) !== sha256(sourceVba)) {
    throw new Error('Generated XLSM failed VBA integrity verification.')
  }
  return output
}

module.exports = {
  DATA_COLUMNS,
  DATA_END_ROW,
  DATA_START_ROW,
  OFFICIAL_HEADERS,
  OFFICIAL_SHEETS,
  TARGET_SHEET,
  renderMovementPlanWorkbook,
  sha256,
}

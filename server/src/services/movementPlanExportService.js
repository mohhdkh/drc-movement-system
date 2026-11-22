const fs = require('node:fs')
const path = require('node:path')
const { drivers } = require('../data/drivers')
const { gpsDevices } = require('../data/gpsDevices')
const { locations } = require('../data/locations')
const { users } = require('../data/users')
const { vehicles } = require('../data/vehicles')
const { getOperationalProvider } = require('../db/operationalDatabase')
const { AppError } = require('../utils/AppError')
const { listMovements } = require('./movementService')
const { mapMovementPlanRows } = require('./movementPlanMapper')
const { renderMovementPlanWorkbook } = require('./movementPlanWorkbook')

const TEMPLATE_NAME = 'Movement_Tracker_LIVE (1).xlsm'

function getTemplatePath(environment = process.env) {
  if (environment.MOVEMENT_PLAN_TEMPLATE_PATH) {
    return path.resolve(environment.MOVEMENT_PLAN_TEMPLATE_PATH)
  }
  const projectRoot = path.resolve(__dirname, '../../..')
  const expected = path.join(projectRoot, 'docs', TEMPLATE_NAME)
  if (fs.existsSync(expected)) return expected
  return path.join(projectRoot, 'doc', TEMPLATE_NAME)
}

function validateMovementId(value) {
  if (value == null || value === '') return undefined
  if (typeof value !== 'string' || !/^MOV-[A-Z0-9-]+$/i.test(value.trim())) {
    throw new AppError('Movement ID is invalid.', 400, undefined, 'MOVEMENT_PLAN_ID_INVALID')
  }
  return value.trim().toUpperCase()
}

async function createMovementPlanExport({ movementId, templatePath } = {}) {
  const selectedMovementId = validateMovementId(movementId)
  const rows = mapMovementPlanRows({
    movements: listMovements(),
    users,
    locations,
    vehicles,
    drivers,
    gpsDevices,
    movementId: selectedMovementId,
  })
  const workbook = await renderMovementPlanWorkbook({
    templatePath: templatePath || getTemplatePath(),
    rows,
  })
  const suffix = selectedMovementId || 'FINAL_APPROVED'
  return {
    workbook,
    filename: `DRC_Movement_Tracker_${suffix}.xlsm`,
    movementCount: new Set(rows.map((row) => row.movementId)).size,
    segmentCount: rows.length,
    source: getOperationalProvider().name,
  }
}

module.exports = { createMovementPlanExport, getTemplatePath, validateMovementId }

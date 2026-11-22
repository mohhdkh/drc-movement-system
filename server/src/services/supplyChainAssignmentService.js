const { drivers } = require('../data/drivers')
const { replaceMovement } = require('../data/movementStore')
const { vehicles } = require('../data/vehicles')
const { AppError, ValidationError } = require('../utils/AppError')
const { findDriverConflict } = require('./driverConflictService')
const { getMovement, listMovements } = require('./movementService')
const { findVehicleConflict } = require('./vehicleConflictService')
const { requireRole } = require('./roleService')

const SUPPLY_CHAIN_VISIBLE_STATUSES = new Set([
  'SAFETY_APPROVED',
  'VEHICLE_ASSIGNED',
  'PENDING_AREA_MANAGER',
  'FINAL_APPROVED',
  'FINAL_REJECTED',
])

function listSupplyChainMovements({ status } = {}) {
  return listMovements()
    .filter((movement) => (
      SUPPLY_CHAIN_VISIBLE_STATUSES.has(movement.status) &&
      (!status || movement.status === status)
    ))
    .sort((a, b) => {
      const awaitingDifference =
        Number(b.status === 'SAFETY_APPROVED') - Number(a.status === 'SAFETY_APPROVED')
      return awaitingDifference || b.createdAt.localeCompare(a.createdAt)
    })
}

function getSupplyChainMovement(id) {
  return getMovement(id)
}

async function submitSupplyChainAssignment(id, input, { actor, now = new Date() } = {}) {
  const assigner = requireRole(actor, 'SUPPLY_CHAIN')
  const movement = getMovement(id)

  if (movement.status !== 'SAFETY_APPROVED') {
    throw new AppError(
      'This movement is not awaiting a Supply Chain assignment.',
      409,
      [{
        field: 'status',
        message: `Vehicle and driver assignment is not allowed from ${movement.status}.`,
      }],
    )
  }

  input = input && typeof input === 'object' ? input : {}
  const errors = []
  const assignedBy = assigner.id
  const vehicleId = typeof input.vehicleId === 'string' ? input.vehicleId.trim() : ''
  const driverId = typeof input.driverId === 'string' ? input.driverId.trim() : ''
  const comment = typeof input.comment === 'string' ? input.comment.trim() : ''
  const vehicle = vehicles.find((item) => item.id === vehicleId && item.active)
  const driver = drivers.find((item) => item.id === driverId && item.active)

  if (!vehicleId) {
    errors.push({ field: 'vehicleId', message: 'Select a vehicle.' })
  } else if (!vehicle) {
    errors.push({
      field: 'vehicleId',
      message: 'The selected vehicle is inactive or does not exist.',
    })
  }

  if (!driverId) {
    errors.push({ field: 'driverId', message: 'Select a driver.' })
  } else if (!driver) {
    errors.push({
      field: 'driverId',
      message: 'The selected driver is inactive or does not exist.',
    })
  }

  if (errors.length > 0) {
    throw new ValidationError(errors, 'Supply Chain assignment validation failed')
  }

  const movements = listMovements()
  const conflictCandidate = {
    id: movement.id,
    movementDate: movement.movementDate,
    etd: movement.etd,
    eta: movement.eta,
    vehicleId,
    driverId,
  }
  const vehicleConflict = findVehicleConflict(conflictCandidate, movements)

  if (vehicleConflict) {
    throw new AppError(
      'The selected vehicle is not available for this movement time.',
      409,
      [{
        field: 'vehicleId',
        message: `${vehicleConflict.id} already uses this vehicle from ${vehicleConflict.etd} to ${vehicleConflict.eta}.`,
      }],
    )
  }

  const driverConflict = findDriverConflict(conflictCandidate, movements)

  if (driverConflict) {
    throw new AppError(
      'The selected driver is not available for this movement time.',
      409,
      [{
        field: 'driverId',
        message: `${driverConflict.id} already uses this driver from ${driverConflict.etd} to ${driverConflict.eta}.`,
      }],
    )
  }

  const timestamp = now.toISOString()
  const updatedMovement = {
    ...movement,
    status: 'VEHICLE_ASSIGNED',
    supplyChainAssignment: {
      assignedBy,
      assignedAt: timestamp,
      vehicleId,
      driverId,
      comment: comment || null,
    },
    updatedAt: timestamp,
  }

  return await replaceMovement(updatedMovement, { actorId: assigner.id, context: comment || 'Vehicle and driver assigned.' })
}

module.exports = {
  SUPPLY_CHAIN_VISIBLE_STATUSES,
  getSupplyChainMovement,
  listSupplyChainMovements,
  submitSupplyChainAssignment,
}

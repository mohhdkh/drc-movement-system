const { timesOverlap } = require('./scheduleOverlapService')

const VEHICLE_RESERVED_STATUSES = new Set([
  'VEHICLE_ASSIGNED',
  'PENDING_AREA_MANAGER',
  'FINAL_APPROVED',
])

function findVehicleConflict(candidate, movements) {
  return movements.find((movement) => (
    movement.id !== candidate.id &&
    movement.movementDate === candidate.movementDate &&
    VEHICLE_RESERVED_STATUSES.has(movement.status) &&
    movement.supplyChainAssignment?.vehicleId === candidate.vehicleId &&
    timesOverlap(candidate.etd, candidate.eta, movement.etd, movement.eta)
  ))
}

module.exports = { findVehicleConflict, VEHICLE_RESERVED_STATUSES }


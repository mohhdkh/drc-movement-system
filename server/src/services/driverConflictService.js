const { timesOverlap } = require('./scheduleOverlapService')

const DRIVER_RESERVED_STATUSES = new Set([
  'VEHICLE_ASSIGNED',
  'PENDING_AREA_MANAGER',
  'FINAL_APPROVED',
])

function findDriverConflict(candidate, movements) {
  return movements.find((movement) => (
    movement.id !== candidate.id &&
    movement.movementDate === candidate.movementDate &&
    DRIVER_RESERVED_STATUSES.has(movement.status) &&
    movement.supplyChainAssignment?.driverId === candidate.driverId &&
    timesOverlap(candidate.etd, candidate.eta, movement.etd, movement.eta)
  ))
}

module.exports = { DRIVER_RESERVED_STATUSES, findDriverConflict }


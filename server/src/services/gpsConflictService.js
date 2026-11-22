const GPS_RESERVED_STATUSES = new Set(['SAFETY_APPROVED'])

function findGpsConflict(candidate, movements) {
  return movements.find((movement) => {
    if (
      movement.id === candidate.id ||
      movement.movementDate !== candidate.movementDate ||
      !GPS_RESERVED_STATUSES.has(movement.status) ||
      movement.gpsAssignment?.type !== 'DEVICE' ||
      movement.gpsAssignment.gpsDeviceId !== candidate.gpsDeviceId
    ) {
      return false
    }

    return candidate.etd < movement.eta && candidate.eta > movement.etd
  })
}

module.exports = { findGpsConflict, GPS_RESERVED_STATUSES }


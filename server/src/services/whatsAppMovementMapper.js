const { AppError } = require('../utils/AppError')

function byId(items) {
  return new Map(items.map((item) => [item.id, item]))
}

function locationKey(value) {
  return String(value || '').trim().toLowerCase()
}

function mapCoordinates(location) {
  if (location?.latitude == null || location?.longitude == null) return null
  return {
    latitude: Number(location.latitude),
    longitude: Number(location.longitude),
  }
}

function displayPerson(person, fallbackId) {
  return {
    id: person?.id || fallbackId,
    name: person?.name || fallbackId,
    phone: person?.phone || null,
  }
}

function validateMovementId(value) {
  if (typeof value !== 'string' || !/^MOV-[A-Z0-9-]+$/i.test(value.trim())) {
    throw new AppError(
      'Movement ID is invalid.',
      400,
      undefined,
      'WHATSAPP_MOVEMENT_ID_INVALID',
    )
  }
  return value.trim().toUpperCase()
}

function mapWhatsAppMovement({ movements, users, locations, vehicles, drivers, gpsDevices, movementId }) {
  const selectedMovementId = validateMovementId(movementId)
  const movement = movements.find((item) => (
    item.id === selectedMovementId && item.status === 'FINAL_APPROVED'
  ))

  if (!movement) {
    throw new AppError(
      'The requested final-approved movement was not found.',
      404,
      undefined,
      'WHATSAPP_MOVEMENT_NOT_FOUND',
    )
  }
  if (!Array.isArray(movement.segments) || !movement.segments.length) {
    throw new AppError(
      `Movement ${movement.id} has no persisted segments.`,
      409,
      undefined,
      'WHATSAPP_MOVEMENT_DATA_INCOMPLETE',
    )
  }

  const userIndex = byId(users)
  const vehicleIndex = byId(vehicles)
  const driverIndex = byId(drivers)
  const gpsIndex = byId(gpsDevices)
  const locationIndex = new Map(locations.map((location) => [locationKey(location.name), location]))
  const segments = [...movement.segments]
    .sort((left, right) => Number(left.sequence || 0) - Number(right.sequence || 0))
    .map((segment, index) => ({
      code: segment.code || `M${String(index + 1).padStart(2, '0')}`,
      fromLocation: segment.fromLocation,
      toLocation: segment.toLocation,
      fromCoordinates: mapCoordinates(locationIndex.get(locationKey(segment.fromLocation))),
      toCoordinates: mapCoordinates(locationIndex.get(locationKey(segment.toLocation))),
      arrivalTime: segment.arrivalTime || null,
      departureTime: segment.departureTime || null,
      passengers: (segment.passengerIds || []).map((id) => displayPerson(userIndex.get(id), id)),
    }))

  const passengerIds = []
  for (const segment of segments) {
    for (const passenger of segment.passengers) {
      if (!passengerIds.some((item) => item.id === passenger.id)) passengerIds.push(passenger)
    }
  }

  const driverId = movement.supplyChainAssignment?.driverId
  const vehicleId = movement.supplyChainAssignment?.vehicleId
  const gpsDeviceId = movement.gpsAssignment?.gpsDeviceId

  return {
    movementId: movement.id,
    movementDate: movement.movementDate,
    etd: movement.etd,
    purpose: movement.purpose,
    vehicle: vehicleIndex.get(vehicleId)?.code || vehicleId || null,
    driver: driverId ? displayPerson(driverIndex.get(driverId), driverId) : null,
    passengers: passengerIds,
    vehicleLeader: displayPerson(userIndex.get(movement.vehicleLeaderId), movement.vehicleLeaderId),
    gps: movement.gpsAssignment?.type === 'NO_GPS'
      ? { type: 'NO_GPS', label: null }
      : { type: 'DEVICE', label: gpsIndex.get(gpsDeviceId)?.code || gpsDeviceId || null },
    segments,
    status: movement.status,
  }
}

module.exports = { mapCoordinates, mapWhatsAppMovement, validateMovementId }

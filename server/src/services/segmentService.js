const { locations } = require('../data/locations')

function getSegmentCode(sequence) {
  return `M${String(sequence).padStart(2, '0')}`
}

function generateSegments({
  movementId,
  startLocation,
  startLocationId,
  routePoints,
  routePointLocationIds = [],
  segmentInputs,
}) {
  const allPoints = [startLocation, ...routePoints]
  const pointIds = [startLocationId, ...routePointLocationIds]
  const pointMetadata = pointIds.map((id, index) => locations.find((location) => location.id === id) || {
    id: id ?? null,
    latitude: null,
    longitude: null,
    name: allPoints[index],
  })

  return routePoints.map((toLocation, index) => {
    const sequence = index + 1
    const code = getSegmentCode(sequence)

    return {
      id: `${movementId}-${code}`,
      movementId,
      sequence,
      code,
      fromLocation: allPoints[index],
      toLocation,
      fromLocationId: index === 0 ? startLocationId ?? null : routePointLocationIds[index - 1] ?? null,
      toLocationId: routePointLocationIds[index] ?? null,
      fromLatitude: pointMetadata[index]?.latitude ?? null,
      fromLongitude: pointMetadata[index]?.longitude ?? null,
      toLatitude: pointMetadata[index + 1]?.latitude ?? null,
      toLongitude: pointMetadata[index + 1]?.longitude ?? null,
      arrivalTime: segmentInputs[index].arrivalTime,
      departureTime: segmentInputs[index].departureTime,
      passengerIds: [...segmentInputs[index].passengerIds],
    }
  })
}

module.exports = { generateSegments, getSegmentCode }

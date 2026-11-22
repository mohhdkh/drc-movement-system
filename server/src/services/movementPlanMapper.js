const { AppError } = require('../utils/AppError')

const MAX_OFFICIAL_PLANS = 50
const MAX_OFFICIAL_SEGMENTS = 5996

function byId(items) {
  return new Map(items.map((item) => [item.id, item]))
}

function locationKey(value) {
  return String(value || '').trim().toLowerCase()
}

function movementCode(index) {
  return `M${String(index + 1).padStart(2, '0')}`
}

function planCode(index) {
  return `P${String(index + 1).padStart(2, '0')}`
}

function resolvedUser(userIndex, id) {
  if (!id) return { id: '', name: '', phone: '' }
  const user = userIndex.get(id)
  return {
    id,
    name: user?.name || id,
    phone: user?.phone || '',
  }
}

function appendOverflowNotes(notes, passengers, overflowCount) {
  if (!overflowCount) return notes || ''
  const manifest = passengers
    .map((passenger) => passenger.phone
      ? `${passenger.name} (${passenger.phone})`
      : passenger.name)
    .join('; ')
  return [
    notes,
    `PAX_MANIFEST | pax=${manifest}`,
    `EXTRA_PAX_COUNT=${overflowCount}`,
  ].filter(Boolean).join('\n')
}

function mapMovementPlanRows({
  movements,
  users,
  locations,
  vehicles,
  drivers,
  gpsDevices,
  movementId,
}) {
  const selected = movements
    .filter((movement) => movement.status === 'FINAL_APPROVED')
    .filter((movement) => !movementId || movement.id === movementId)
    .sort((left, right) => (
      String(left.movementDate || '').localeCompare(String(right.movementDate || '')) ||
      String(left.etd || '').localeCompare(String(right.etd || '')) ||
      String(left.id || '').localeCompare(String(right.id || ''))
    ))

  if (!selected.length) {
    throw new AppError(
      movementId
        ? 'The requested final-approved movement was not found.'
        : 'No final-approved movements are available to export.',
      404,
      undefined,
      'MOVEMENT_PLAN_NOT_FOUND',
    )
  }
  if (selected.length > MAX_OFFICIAL_PLANS) {
    throw new AppError(
      `The official workbook supports at most ${MAX_OFFICIAL_PLANS} plans per export.`,
      409,
      undefined,
      'MOVEMENT_PLAN_WORKBOOK_LIMIT',
    )
  }

  const userIndex = byId(users)
  const vehicleIndex = byId(vehicles)
  const driverIndex = byId(drivers)
  const gpsIndex = byId(gpsDevices)
  const locationIndex = new Map(locations.map((location) => [locationKey(location.name), location]))
  const rows = []

  selected.forEach((movement, planIndex) => {
    if (!Array.isArray(movement.segments) || !movement.segments.length) {
      throw new AppError(
        `Movement ${movement.id} has no persisted segments.`,
        409,
        undefined,
        'MOVEMENT_PLAN_DATA_INCOMPLETE',
      )
    }

    const leader = resolvedUser(userIndex, movement.vehicleLeaderId)
    const vehicle = vehicleIndex.get(movement.supplyChainAssignment?.vehicleId)
    const driverId = movement.supplyChainAssignment?.driverId
    const driver = driverIndex.get(driverId)
    const gps = gpsIndex.get(movement.gpsAssignment?.gpsDeviceId)
    const orderedSegments = movement.segments
      .map((segment, originalIndex) => ({ segment, originalIndex }))
      .sort((left, right) => (
        (Number(left.segment.sequence) || left.originalIndex + 1) -
        (Number(right.segment.sequence) || right.originalIndex + 1) ||
        left.originalIndex - right.originalIndex
      ))

    orderedSegments.forEach(({ segment }, segmentIndex) => {
      const previousSegment = orderedSegments[segmentIndex - 1]?.segment
      const seenPassengerIds = new Set()
      const passengers = []
      for (const id of [movement.vehicleLeaderId, ...(segment.passengerIds || [])]) {
        if (!id || seenPassengerIds.has(id)) continue
        seenPassengerIds.add(id)
        passengers.push(resolvedUser(userIndex, id))
      }
      const overflowPassengers = passengers.slice(6)
      const fromLocation = locationIndex.get(locationKey(segment.fromLocation))
      const toLocation = locationIndex.get(locationKey(segment.toLocation))

      rows.push({
        movementId: movement.id,
        movementDate: movement.movementDate,
        planNumber: planCode(planIndex),
        segmentNumber: segment.code || movementCode(segmentIndex),
        passengerCount: passengers.length + (driverId ? 1 : 0),
        purpose: movement.purpose || '',
        leadPassenger: passengers[0]?.name || leader.name,
        otherPassengers: passengers.slice(1, 6).map((passenger) => passenger.name),
        driver: driver?.name || driverId || '',
        vehicleCode: vehicle?.code || movement.supplyChainAssignment?.vehicleId || '',
        visualMarker: vehicle?.visualMarker || '',
        vehicleModel: vehicle?.model || '',
        plateNumber: vehicle?.plateNumber || '',
        gpsDevice: movement.gpsAssignment?.type === 'DEVICE'
          ? gps?.code || movement.gpsAssignment?.gpsDeviceId || ''
          : '',
        imei: movement.gpsAssignment?.type === 'DEVICE' ? gps?.imei || '' : '',
        fromLocation: segment.fromLocation || '',
        fromLatitude: fromLocation?.latitude ?? null,
        fromLongitude: fromLocation?.longitude ?? null,
        toLocation: segment.toLocation || '',
        toLatitude: toLocation?.latitude ?? null,
        toLongitude: toLocation?.longitude ?? null,
        departureTime: segmentIndex === 0 ? movement.etd || '' : previousSegment?.departureTime || '',
        arrivalTime: segment.arrivalTime || '',
        riskLevel: movement.riskLevel || '',
        validatedBy: resolvedUser(userIndex, movement.areaManagerApproval?.reviewedBy).name,
        validationStatus: 'YES',
        arrived: '',
        notes: appendOverflowNotes(
          movement.notes || '',
          passengers,
          overflowPassengers.length,
        ),
        overflowPassengers: overflowPassengers.map((passenger) => ({ ...passenger })),
      })
    })
  })

  if (rows.length > MAX_OFFICIAL_SEGMENTS) {
    throw new AppError(
      `The official workbook supports at most ${MAX_OFFICIAL_SEGMENTS} segment rows per export.`,
      409,
      undefined,
      'MOVEMENT_PLAN_WORKBOOK_LIMIT',
    )
  }
  return rows
}

module.exports = {
  MAX_OFFICIAL_PLANS,
  MAX_OFFICIAL_SEGMENTS,
  mapMovementPlanRows,
  movementCode,
  planCode,
}

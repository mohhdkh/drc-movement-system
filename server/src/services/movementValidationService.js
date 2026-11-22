const { users } = require('../data/users')
const { locations } = require('../data/locations')
const { ValidationError } = require('../utils/AppError')
const {
  getCutoffContext,
  isAfterSubmissionCutoff,
  isValidDateOnly,
} = require('./cutoffService')

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

function isFiveMinuteTime(value) {
  return TIME_PATTERN.test(value) && Number(value.slice(-2)) % 5 === 0
}

function minutes(value) {
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3))
}

function validateMovementRequest(input, { now = new Date() } = {}) {
  input = input && typeof input === 'object' ? input : {}
  const errors = []
  const usesRouteChainTimes = typeof input.startDepartureTime === 'string' || Array.isArray(input.routePointLocationIds)
  const employeeIds = new Set(
    users
      .filter((user) => user.active && user.roles.includes('EMPLOYEE'))
      .map((user) => user.id),
  )
  const normalized = {
    requesterId: typeof input.requesterId === 'string' ? input.requesterId.trim() : '',
    movementDate: typeof input.movementDate === 'string' ? input.movementDate.trim() : '',
    purpose: typeof input.purpose === 'string' ? input.purpose.trim() : '',
    etd: '',
    eta: '',
    startLocation: typeof input.startLocation === 'string' ? input.startLocation.trim() : '',
    startLocationId: typeof input.startLocationId === 'string' ? input.startLocationId.trim() : '',
    startDepartureTime: typeof input.startDepartureTime === 'string' ? input.startDepartureTime.trim() : '',
    routePoints: Array.isArray(input.routePoints)
      ? input.routePoints.map((point) => (typeof point === 'string' ? point.trim() : ''))
      : [],
    routePointLocationIds: Array.isArray(input.routePointLocationIds)
      ? input.routePointLocationIds.map((point) => (typeof point === 'string' ? point.trim() : ''))
      : [],
    notes: typeof input.notes === 'string' ? input.notes.trim() : '',
    vehicleLeaderId:
      typeof input.vehicleLeaderId === 'string' ? input.vehicleLeaderId.trim() : '',
    segments: Array.isArray(input.segments) ? input.segments : [],
  }

  if (!normalized.requesterId) {
    errors.push({ field: 'requesterId', message: 'Requester is required.' })
  } else if (!employeeIds.has(normalized.requesterId)) {
    errors.push({ field: 'requesterId', message: 'Requester must be an active employee.' })
  }

  if (!isValidDateOnly(normalized.movementDate)) {
    errors.push({ field: 'movementDate', message: 'A valid movement date is required.' })
  } else if (isAfterSubmissionCutoff(normalized.movementDate, now)) {
    const cutoff = getCutoffContext(normalized.movementDate)
    errors.push({
      field: 'movementDate',
      message: `Submission closed at ${String(cutoff.cutoffHour).padStart(2, '0')}:00 on ${cutoff.cutoffDate} (${cutoff.timeZone}).`,
    })
  }

  if (!normalized.purpose) {
    errors.push({ field: 'purpose', message: 'Purpose is required.' })
  }

  if (!normalized.startLocation) {
    errors.push({ field: 'startLocation', message: 'Start location is required.' })
  }

  if (normalized.startLocationId) {
    const location = locations.find((item) => item.id === normalized.startLocationId && item.active)
    if (!location) errors.push({ field: 'startLocation', message: 'Start location must be an active master location.' })
  }

  if (normalized.routePointLocationIds.length && normalized.routePointLocationIds.length !== normalized.routePoints.length) {
    errors.push({ field: 'routePoints', message: 'A master location is required for every stop.' })
  }
  normalized.routePointLocationIds.forEach((locationId, index) => {
    if (locationId && !locations.some((item) => item.id === locationId && item.active)) {
      errors.push({ field: `routePoints.${index}`, message: 'Stop location must be an active master location.' })
    }
  })

  if (normalized.startDepartureTime && !isFiveMinuteTime(normalized.startDepartureTime)) {
    errors.push({ field: 'startDepartureTime', message: 'Start departure time must use a 5-minute interval.' })
  }

  if (normalized.routePoints.length === 0) {
    errors.push({ field: 'routePoints', message: 'At least one stop is required.' })
  } else if (normalized.routePoints.some((point) => !point)) {
    errors.push({ field: 'routePoints', message: 'Every stop must have a location.' })
  }

  if (!normalized.vehicleLeaderId) {
    errors.push({ field: 'vehicleLeaderId', message: 'Vehicle Leader is required.' })
  } else if (!employeeIds.has(normalized.vehicleLeaderId)) {
    errors.push({ field: 'vehicleLeaderId', message: 'Vehicle Leader must be an active employee.' })
  }

  if (normalized.segments.length !== normalized.routePoints.length) {
    errors.push({
      field: 'segments',
      message: 'Passenger selections must be provided for every route segment.',
    })
  }

  normalized.segments = normalized.routePoints.map((_, index) => {
    const segmentInput = normalized.segments[index]
    const suppliedPassengerIds = Array.isArray(segmentInput?.passengerIds)
      ? segmentInput.passengerIds
        .filter((id) => typeof id === 'string')
        .map((id) => id.trim())
        .filter(Boolean)
      : []
    const passengerIds = [...new Set(suppliedPassengerIds)]
    const field = `segments.${index}.passengerIds`
    const arrivalTime = typeof segmentInput?.arrivalTime === 'string'
      ? segmentInput.arrivalTime.trim()
      : ''
    const departureTime = typeof segmentInput?.departureTime === 'string'
      ? segmentInput.departureTime.trim()
      : ''

    if (!isFiveMinuteTime(arrivalTime)) {
      errors.push({
        field: `segments.${index}.arrivalTime`,
        message: `A valid arrival time is required for stop ${index + 1}.`,
      })
    }

    if (!isFiveMinuteTime(departureTime)) {
      errors.push({
        field: `segments.${index}.departureTime`,
        message: `A valid departure time is required for stop ${index + 1}.`,
      })
    }

    if (passengerIds.length === 0) {
      errors.push({ field, message: `Segment ${index + 1} must have at least one passenger.` })
    }

    if (suppliedPassengerIds.length > 7) {
      errors.push({ field, message: `Segment ${index + 1} cannot have more than 7 passengers.` })
    }

    if (passengerIds.length !== suppliedPassengerIds.length) {
      errors.push({ field, message: `Segment ${index + 1} cannot contain duplicate passengers.` })
    }

    if (passengerIds.some((id) => !employeeIds.has(id))) {
      errors.push({ field, message: `Segment ${index + 1} contains an unknown passenger.` })
    }

    if (
      normalized.vehicleLeaderId &&
      employeeIds.has(normalized.vehicleLeaderId) &&
      !passengerIds.includes(normalized.vehicleLeaderId)
    ) {
      errors.push({
        field,
        message: `Vehicle Leader must be a passenger on segment ${index + 1}.`,
      })
    }

    return { passengerIds, arrivalTime, departureTime }
  })

  const routeTimes = normalized.segments
  let previousDeparture = normalized.startDepartureTime && isFiveMinuteTime(normalized.startDepartureTime)
    ? minutes(normalized.startDepartureTime)
    : null
  routeTimes.forEach((segment, index) => {
    if (!usesRouteChainTimes) return
    if (isFiveMinuteTime(segment.departureTime) && isFiveMinuteTime(segment.arrivalTime) && minutes(segment.departureTime) >= minutes(segment.arrivalTime)) {
      errors.push({ field: `segments.${index}.arrivalTime`, message: 'Route times must move forward chronologically.' })
    }
    const nextDeparture = routeTimes[index + 1]?.departureTime
    if (isFiveMinuteTime(segment.arrivalTime) && isFiveMinuteTime(nextDeparture) && minutes(segment.arrivalTime) > minutes(nextDeparture)) {
      errors.push({ field: `segments.${index}.departureTime`, message: 'Arrival cannot be later than the next departure.' })
    }
    if (previousDeparture !== null && isFiveMinuteTime(segment.arrivalTime) && previousDeparture >= minutes(segment.arrivalTime)) {
      errors.push({ field: `segments.${index}.arrivalTime`, message: 'Route times must move forward chronologically.' })
    }
    if (isFiveMinuteTime(segment.departureTime)) previousDeparture = minutes(segment.departureTime)
  })

  normalized.etd = normalized.startDepartureTime || normalized.segments[0]?.departureTime || ''
  normalized.eta = normalized.segments.at(-1)?.arrivalTime || ''

  if (errors.length > 0) {
    throw new ValidationError(errors)
  }

  return normalized
}

module.exports = { validateMovementRequest }

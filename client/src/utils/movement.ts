import type { CreateMovementInput, MovementStatus } from '../types'

const movementTimeZone =
  import.meta.env.VITE_MOVEMENT_TIMEZONE ?? 'Asia/Gaza'
const movementCutoffHour =
  Number(import.meta.env.VITE_MOVEMENT_CUTOFF_HOUR) || 12

export type FormErrors = Record<string, string>

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export function getSegmentCode(sequence: number) {
  return `M${String(sequence).padStart(2, '0')}`
}

function getPreviousDate(dateOnly: string) {
  const [year, month, day] = dateOnly.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

function getZonedDateTime(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: movementTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)

  return Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  )
}

export function isAfterLocalCutoff(movementDate: string, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(movementDate)) {
    return false
  }

  const cutoffDate = getPreviousDate(movementDate)
  const zonedNow = getZonedDateTime(now)
  const currentDate = [zonedNow.year, zonedNow.month, zonedNow.day]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, '0'))
    .join('-')

  if (currentDate !== cutoffDate) {
    return currentDate > cutoffDate
  }

  return zonedNow.hour >= movementCutoffHour
}

export function getCurrentMovementDate(now = new Date()) {
  const zonedNow = getZonedDateTime(now)
  return [zonedNow.year, zonedNow.month, zonedNow.day]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, '0'))
    .join('-')
}

export function validateMovementInput(input: CreateMovementInput): FormErrors {
  const errors: FormErrors = {}

  if (!input.movementDate) {
    errors.movementDate = 'Movement date is required.'
  } else if (isAfterLocalCutoff(input.movementDate)) {
    errors.movementDate = `Requests close at ${movementCutoffHour}:00 on the previous day (${movementTimeZone}).`
  }

  if (!input.purpose.trim()) errors.purpose = 'Purpose is required.'
  if (!input.startLocation.trim()) {
    errors.startLocation = 'Start location is required.'
  }
  if ('startDepartureTime' in input && !TIME_PATTERN.test(input.startDepartureTime ?? '')) {
    errors.startDepartureTime = 'Enter a valid start departure time.'
  } else if ('startDepartureTime' in input && Number((input.startDepartureTime ?? '').slice(-2)) % 5 !== 0) {
    errors.startDepartureTime = 'Use 5-minute time intervals.'
  }
  if (input.routePoints.some((point) => !point.trim())) {
    errors.routePoints = 'Enter a location for every stop.'
  }
  if (input.startLocationId === '') errors.startLocation = 'Select a master start location.'
  if (input.routePointLocationIds?.some((locationId) => !locationId)) {
    errors.routePoints = 'Select a master location for every stop.'
  }
  if (!input.vehicleLeaderId) {
    errors.vehicleLeaderId = 'Select one Vehicle Leader.'
  }

  input.segments.forEach((segment, index) => {
    if (!TIME_PATTERN.test(segment.departureTime)) {
      errors[`segments.${index}.departureTime`] = `Enter a valid departure time for stop ${index + 1}.`
    } else if (Number(segment.departureTime.slice(-2)) % 5 !== 0) {
      errors[`segments.${index}.departureTime`] = 'Use 5-minute time intervals.'
    }
    if ('startDepartureTime' in input) {
      const departureMinutes = Number(segment.departureTime.slice(0, 2)) * 60 + Number(segment.departureTime.slice(3))
      const arrivalMinutes = Number(segment.arrivalTime.slice(0, 2)) * 60 + Number(segment.arrivalTime.slice(3))
      if (TIME_PATTERN.test(segment.departureTime) && TIME_PATTERN.test(segment.arrivalTime) && departureMinutes >= arrivalMinutes) {
        errors[`segments.${index}.arrivalTime`] = 'Route times must move forward chronologically.'
      }
      const nextDeparture = input.segments[index + 1]?.departureTime
      if (nextDeparture && TIME_PATTERN.test(segment.arrivalTime) && TIME_PATTERN.test(nextDeparture)) {
        const nextDepartureMinutes = Number(nextDeparture.slice(0, 2)) * 60 + Number(nextDeparture.slice(3))
        if (arrivalMinutes > nextDepartureMinutes) errors[`segments.${index}.departureTime`] = 'Arrival cannot be later than the next departure.'
      }
    }
    if (!TIME_PATTERN.test(segment.arrivalTime)) {
      errors[`segments.${index}.arrivalTime`] = `Enter a valid arrival time for stop ${index + 1}.`
    } else if (Number(segment.arrivalTime.slice(-2)) % 5 !== 0) {
      errors[`segments.${index}.arrivalTime`] = 'Use 5-minute time intervals.'
    }

    const key = `segments.${index}.passengerIds`
    if (segment.passengerIds.length === 0) {
      errors[key] = 'Select at least one passenger.'
    } else if (segment.passengerIds.length > 7) {
      errors[key] = 'Select no more than 7 passengers.'
    } else if (new Set(segment.passengerIds).size !== segment.passengerIds.length) {
      errors[key] = 'A passenger cannot be selected more than once.'
    } else if (
      input.vehicleLeaderId &&
      !segment.passengerIds.includes(input.vehicleLeaderId)
    ) {
      errors[key] = 'Vehicle Leader must be included on this segment.'
    }
  })

  return errors
}

export function formatMovementStatus(status: MovementStatus) {
  return status
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function formatDate(dateOnly: string) {
  const [year, month, day] = dateOnly.split('-').map(Number)
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

export function formatDateTime(timestamp: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

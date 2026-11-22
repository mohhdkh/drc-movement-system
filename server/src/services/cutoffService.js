const { getSystemSettings } = require('../data/systemSettings')

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function isValidDateOnly(value) {
  const match = DATE_ONLY_PATTERN.exec(value)

  if (!match) {
    return false
  }

  const [, year, month, day] = match.map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

function getPreviousDate(dateOnly) {
  const [year, month, day] = dateOnly.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

function getZonedDateTime(now, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)

  return Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  )
}

function isAfterSubmissionCutoff(
  movementDate,
  now = new Date(),
  settings = {},
) {
  const runtimeSettings = getSystemSettings()
  const timeZone = settings.timeZone || runtimeSettings.movementTimezone
  const cutoffHour = settings.cutoffHour ?? runtimeSettings.movementCutoffHour
  const cutoffDate = getPreviousDate(movementDate)
  const zonedNow = getZonedDateTime(now, timeZone)
  const currentDate = [zonedNow.year, zonedNow.month, zonedNow.day]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, '0'))
    .join('-')

  if (currentDate !== cutoffDate) {
    return currentDate > cutoffDate
  }

  return zonedNow.hour >= cutoffHour
}

function getCutoffContext(movementDate) {
  const settings = getSystemSettings()
  return {
    cutoffDate: getPreviousDate(movementDate),
    cutoffHour: settings.movementCutoffHour,
    timeZone: settings.movementTimezone,
  }
}

module.exports = {
  getCutoffContext,
  isAfterSubmissionCutoff,
  isValidDateOnly,
}

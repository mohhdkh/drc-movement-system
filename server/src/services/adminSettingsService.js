const {
  getSystemSettings,
  replaceSystemSettings,
} = require('../data/systemSettings')
const { ValidationError } = require('../utils/AppError')
const { getAdminActor } = require('./adminAccessService')
const { createAdminAuditEntry } = require('./adminAuditService')

function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format()
    return true
  } catch {
    return false
  }
}

function getAdminSettings() {
  getAdminActor()
  return getSystemSettings()
}

async function updateAdminSettings(input, { now = new Date() } = {}) {
  getAdminActor()
  input = input && typeof input === 'object' ? input : {}
  const current = getSystemSettings()
  const next = { ...current }
  const errors = []

  if (input.movementTimezone !== undefined) {
    const movementTimezone = typeof input.movementTimezone === 'string'
      ? input.movementTimezone.trim()
      : ''
    if (!movementTimezone || !isValidTimeZone(movementTimezone)) {
      errors.push({ field: 'movementTimezone', message: 'Enter a valid IANA timezone.' })
    } else {
      next.movementTimezone = movementTimezone
    }
  }

  if (input.movementCutoffHour !== undefined) {
    const movementCutoffHour = input.movementCutoffHour
    if (!Number.isInteger(movementCutoffHour) || movementCutoffHour < 0 || movementCutoffHour > 23) {
      errors.push({ field: 'movementCutoffHour', message: 'Cutoff hour must be an integer from 0 to 23.' })
    } else {
      next.movementCutoffHour = movementCutoffHour
    }
  }

  if (errors.length > 0) throw new ValidationError(errors, 'Settings validation failed')

  const audit = createAdminAuditEntry({
    action: 'SETTINGS_UPDATED',
    entityType: 'SETTINGS',
    entityId: 'system',
    before: current,
    after: next,
  }, { now })
  return await replaceSystemSettings(next, audit)
}

module.exports = { getAdminSettings, updateAdminSettings }

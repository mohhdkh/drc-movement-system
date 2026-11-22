const {
  movementCutoffHour,
  movementTimeZone,
} = require('../config/env')
const { getOperationalProvider } = require('../db/operationalDatabase')

const provider = getOperationalProvider()

const initialSettings = {
  movementTimezone: movementTimeZone,
  movementCutoffHour,
}

const systemSettings = provider.getSettings()

function getSystemSettings() {
  return { ...systemSettings }
}

function replaceSystemSettings(settings, audit) {
  const previous = { ...systemSettings }
  Object.assign(systemSettings, settings)
  const persisted = provider.saveSettings(systemSettings, audit)
  if (persisted?.then) {
    return persisted.then(() => getSystemSettings()).catch((error) => {
      Object.assign(systemSettings, previous)
      throw error
    })
  }
  return getSystemSettings()
}

function resetSystemSettings() {
  Object.assign(systemSettings, initialSettings)
  return provider.saveSettings(systemSettings)
}

function reloadSystemSettings() {
  Object.assign(systemSettings, provider.getSettings())
  return getSystemSettings()
}

module.exports = {
  getSystemSettings,
  reloadSystemSettings,
  replaceSystemSettings,
  resetSystemSettings,
}

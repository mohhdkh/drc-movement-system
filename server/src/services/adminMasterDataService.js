const { departments, persistDepartments } = require('../data/departments')
const { drivers, persistDrivers } = require('../data/drivers')
const { gpsDevices, persistGpsDevices } = require('../data/gpsDevices')
const { locations, persistLocations } = require('../data/locations')
const { users } = require('../data/users')
const { vehicles, persistVehicles } = require('../data/vehicles')
const { AppError, ValidationError } = require('../utils/AppError')
const { getAdminActor } = require('./adminAccessService')
const { createAdminAuditEntry } = require('./adminAuditService')

const resourceConfigs = {
  vehicles: {
    items: vehicles,
    entityType: 'VEHICLE',
    actionPrefix: 'VEHICLE',
    fields: ['code', 'plateNumber', 'model'],
    required: ['code', 'plateNumber', 'model'],
    uppercase: ['code', 'plateNumber'],
    unique: ['code', 'plateNumber'],
    persist: persistVehicles,
  },
  drivers: {
    items: drivers,
    entityType: 'DRIVER',
    actionPrefix: 'DRIVER',
    fields: ['name', 'phone'],
    required: ['name'],
    persist: persistDrivers,
  },
  'gps-devices': {
    items: gpsDevices,
    entityType: 'GPS_DEVICE',
    actionPrefix: 'GPS',
    fields: ['code', 'label'],
    required: ['code', 'label'],
    uppercase: ['code'],
    unique: ['code'],
    persist: persistGpsDevices,
  },
  departments: {
    items: departments,
    entityType: 'DEPARTMENT',
    actionPrefix: 'DEPARTMENT',
    fields: ['name'],
    required: ['name'],
    unique: ['name'],
    persist: persistDepartments,
  },
  locations: {
    items: locations,
    entityType: 'LOCATION',
    actionPrefix: 'LOCATION',
    fields: ['name', 'latitude', 'longitude'],
    required: ['name'],
    unique: ['name'],
    persist: persistLocations,
  },
}

function getConfig(resourceName) {
  const config = resourceConfigs[resourceName]
  if (!config) throw new AppError('Admin resource not found.', 404)
  return config
}

function normalizeField(field, value, config) {
  if (field === 'latitude' || field === 'longitude') {
    return value === null || value === '' || value === undefined ? null : value
  }
  if (value === null || value === undefined) return null
  const normalized = typeof value === 'string' ? value.trim() : value
  return config.uppercase?.includes(field) && typeof normalized === 'string'
    ? normalized.toUpperCase()
    : normalized
}

function validateFields(candidate, config, errors, currentId) {
  for (const field of config.required || []) {
    if (typeof candidate[field] !== 'string' || !candidate[field]) {
      errors.push({ field, message: `${field} is required.` })
    }
  }

  for (const field of config.unique || []) {
    if (
      candidate[field] &&
      config.items.some((item) => (
        item.id !== currentId &&
        String(item[field]).toLowerCase() === String(candidate[field]).toLowerCase()
      ))
    ) {
      errors.push({ field, message: `${field} must be unique.` })
    }
  }

  for (const field of ['latitude', 'longitude']) {
    if (!(field in candidate) || candidate[field] === null) continue
    if (typeof candidate[field] !== 'number' || !Number.isFinite(candidate[field])) {
      errors.push({ field, message: `${field} must be a number or null.` })
    }
  }
  if (typeof candidate.latitude === 'number' && (candidate.latitude < -90 || candidate.latitude > 90)) {
    errors.push({ field: 'latitude', message: 'latitude must be between -90 and 90.' })
  }
  if (typeof candidate.longitude === 'number' && (candidate.longitude < -180 || candidate.longitude > 180)) {
    errors.push({ field: 'longitude', message: 'longitude must be between -180 and 180.' })
  }
}

function listAdminResources(resourceName) {
  getAdminActor()
  return getConfig(resourceName).items.map((item) => ({ ...item }))
}

function getAdminResource(resourceName, id) {
  getAdminActor()
  const item = getConfig(resourceName).items.find((candidate) => candidate.id === id)
  if (!item) throw new AppError('Admin resource not found.', 404)
  return { ...item }
}

async function createAdminResource(resourceName, input, { now = new Date() } = {}) {
  getAdminActor()
  const config = getConfig(resourceName)
  input = input && typeof input === 'object' ? input : {}
  const errors = []
  const id = typeof input.id === 'string' ? input.id.trim() : ''
  const active = input.active === undefined ? true : input.active
  const candidate = { id }

  for (const field of config.fields) {
    candidate[field] = normalizeField(field, input[field], config)
  }

  if (!id) errors.push({ field: 'id', message: 'ID is required.' })
  else if (config.items.some((item) => item.id === id)) {
    errors.push({ field: 'id', message: 'This ID already exists.' })
  }
  if (typeof active !== 'boolean') errors.push({ field: 'active', message: 'Active must be true or false.' })
  validateFields(candidate, config, errors)
  if (errors.length > 0) throw new ValidationError(errors, `${config.entityType} validation failed`)

  const timestamp = now.toISOString()
  const item = {
    ...candidate,
    active,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  config.items.push(item)
  try {
    await config.persist(createAdminAuditEntry({
      action: `${config.actionPrefix}_CREATED`, entityType: config.entityType,
      entityId: id, before: null, after: item,
    }, { now }))
  } catch (error) {
    config.items.splice(config.items.findIndex((candidate) => candidate.id === id), 1)
    throw error
  }
  return { ...item }
}

async function updateAdminResource(resourceName, id, input, { now = new Date() } = {}) {
  getAdminActor()
  const config = getConfig(resourceName)
  const index = config.items.findIndex((item) => item.id === id)
  if (index === -1) throw new AppError('Admin resource not found.', 404)
  input = input && typeof input === 'object' ? input : {}
  const current = config.items[index]
  const candidate = { ...current }
  const errors = []

  for (const field of config.fields) {
    if (input[field] !== undefined) {
      candidate[field] = normalizeField(field, input[field], config)
    }
  }

  validateFields(candidate, config, errors, id)
  if (errors.length > 0) throw new ValidationError(errors, `${config.entityType} validation failed`)

  const before = { ...current }
  const updated = { ...candidate, updatedAt: now.toISOString() }
  config.items[index] = updated
  try {
    await config.persist(createAdminAuditEntry({
      action: `${config.actionPrefix}_UPDATED`, entityType: config.entityType,
      entityId: id, before, after: updated,
    }, { now }))
  } catch (error) {
    config.items[index] = current
    throw error
  }
  return { ...updated }
}

async function updateAdminResourceStatus(resourceName, id, input, { now = new Date() } = {}) {
  getAdminActor()
  const config = getConfig(resourceName)
  const index = config.items.findIndex((item) => item.id === id)
  if (index === -1) throw new AppError('Admin resource not found.', 404)
  const active = input && typeof input === 'object' ? input.active : undefined
  if (typeof active !== 'boolean') {
    throw new ValidationError(
      [{ field: 'active', message: 'Active must be true or false.' }],
      `${config.entityType} status validation failed`,
    )
  }

  const before = { ...config.items[index] }
  const updated = { ...config.items[index], active, updatedAt: now.toISOString() }
  config.items[index] = updated
  try {
    await config.persist(createAdminAuditEntry({
      action: `${config.actionPrefix}_STATUS_CHANGED`, entityType: config.entityType,
      entityId: id, before, after: updated,
    }, { now }))
  } catch (error) {
    config.items[index] = before
    throw error
  }
  return { ...updated }
}

function getAdminSummary() {
  getAdminActor()
  return {
    activeUsers: users.filter((user) => user.active).length,
    vehicles: vehicles.filter((item) => item.active).length,
    drivers: drivers.filter((item) => item.active).length,
    gpsDevices: gpsDevices.filter((item) => item.active).length,
    departments: departments.filter((item) => item.active).length,
    locations: locations.filter((item) => item.active).length,
  }
}

module.exports = {
  createAdminResource,
  getAdminResource,
  getAdminSummary,
  listAdminResources,
  updateAdminResource,
  updateAdminResourceStatus,
}

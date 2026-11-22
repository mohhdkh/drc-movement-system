const { departments } = require('../data/departments')
const { persistUsers, users } = require('../data/users')
const { AppError, ValidationError } = require('../utils/AppError')
const { getAdminActor } = require('./adminAccessService')
const { createAdminAuditEntry } = require('./adminAuditService')
const { areValidRoles } = require('./roleService')

function toAdminUser(user) {
  const { entraObjectId, entraTenantId, ...safeUser } = user
  return {
    ...safeUser,
    entraLinked: Boolean(entraObjectId && entraTenantId),
    roles: [...user.roles],
  }
}

function getAdminUsers() {
  getAdminActor()
  return users.map(toAdminUser)
}

function getAdminUser(id) {
  getAdminActor()
  const user = users.find((item) => item.id === id)
  if (!user) throw new AppError('User not found.', 404)
  return toAdminUser(user)
}

function normalizedNullableString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function validateDepartment(departmentId, errors) {
  if (!departmentId) return
  const department = departments.find((item) => item.id === departmentId && item.active)
  if (!department) {
    errors.push({
      field: 'departmentId',
      message: 'Department must reference an active department.',
    })
  }
}

function validateUniqueEmail(email, errors, currentId) {
  if (!email) return
  if (users.some((user) => user.id !== currentId && user.email?.toLowerCase() === email.toLowerCase())) {
    errors.push({ field: 'email', message: 'A user with this email already exists.' })
  }
}

async function createAdminUser(input, { now = new Date() } = {}) {
  getAdminActor()
  input = input && typeof input === 'object' ? input : {}
  const errors = []
  const id = typeof input.id === 'string' ? input.id.trim() : ''
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  const email = normalizedNullableString(input.email)?.toLowerCase() ?? null
  const phone = normalizedNullableString(input.phone)
  const departmentId = normalizedNullableString(input.departmentId)
  const roles = Array.isArray(input.roles)
    ? [...new Set(input.roles.filter((role) => typeof role === 'string').map((role) => role.trim()))]
    : []
  const active = input.active === undefined ? true : input.active

  if (!id) errors.push({ field: 'id', message: 'User ID is required.' })
  else if (users.some((user) => user.id === id)) {
    errors.push({ field: 'id', message: 'A user with this ID already exists.' })
  }
  if (!name) errors.push({ field: 'name', message: 'User name is required.' })
  if (typeof active !== 'boolean') errors.push({ field: 'active', message: 'Active must be true or false.' })
  if (!areValidRoles(roles)) errors.push({ field: 'roles', message: 'One or more roles are invalid.' })
  if (active === true && roles.length === 0) {
    errors.push({ field: 'roles', message: 'Active users must have at least one role.' })
  }
  validateDepartment(departmentId, errors)
  validateUniqueEmail(email, errors)

  if (errors.length > 0) throw new ValidationError(errors, 'User validation failed')

  const timestamp = now.toISOString()
  const user = {
    id,
    name,
    email,
    phone,
    departmentId,
    entraObjectId: null,
    entraTenantId: null,
    entraPrincipalName: null,
    roles,
    active,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  users.push(user)
  try {
    await persistUsers(createAdminAuditEntry({
      action: 'USER_CREATED', entityType: 'USER', entityId: id, before: null, after: user,
    }, { now }))
  } catch (error) {
    users.splice(users.findIndex((item) => item.id === id), 1)
    throw error
  }
  return toAdminUser(user)
}

async function updateAdminUser(id, input, { now = new Date() } = {}) {
  getAdminActor()
  const index = users.findIndex((user) => user.id === id)
  if (index === -1) throw new AppError('User not found.', 404)
  input = input && typeof input === 'object' ? input : {}
  const current = users[index]
  const errors = []
  const name = input.name === undefined
    ? current.name
    : typeof input.name === 'string' ? input.name.trim() : ''
  const email = input.email === undefined
    ? current.email
    : normalizedNullableString(input.email)?.toLowerCase() ?? null
  const phone = input.phone === undefined ? current.phone : normalizedNullableString(input.phone)
  const departmentId = input.departmentId === undefined
    ? current.departmentId
    : normalizedNullableString(input.departmentId)

  if (!name) errors.push({ field: 'name', message: 'User name is required.' })
  validateDepartment(departmentId, errors)
  validateUniqueEmail(email, errors, id)
  if (errors.length > 0) throw new ValidationError(errors, 'User validation failed')

  const before = { ...current, roles: [...current.roles] }
  const updated = {
    ...current,
    name,
    email,
    phone,
    departmentId,
    updatedAt: now.toISOString(),
  }
  users[index] = updated
  try {
    await persistUsers(createAdminAuditEntry({
      action: 'USER_UPDATED', entityType: 'USER', entityId: id, before, after: updated,
    }, { now }))
  } catch (error) {
    users[index] = current
    throw error
  }
  return toAdminUser(updated)
}

async function updateAdminUserStatus(id, input, { now = new Date() } = {}) {
  const actor = getAdminActor()
  const index = users.findIndex((user) => user.id === id)
  if (index === -1) throw new AppError('User not found.', 404)
  input = input && typeof input === 'object' ? input : {}
  const active = input.active
  const errors = []

  if (typeof active !== 'boolean') {
    errors.push({ field: 'active', message: 'Active must be true or false.' })
  } else if (active && users[index].roles.length === 0) {
    errors.push({ field: 'roles', message: 'Active users must have at least one role.' })
  } else if (!active && id === actor.id) {
    errors.push({ field: 'active', message: 'The current local Admin user cannot deactivate itself.' })
  }
  if (errors.length > 0) throw new ValidationError(errors, 'User status validation failed')

  const before = { ...users[index], roles: [...users[index].roles] }
  const updated = { ...users[index], active, updatedAt: now.toISOString() }
  users[index] = updated
  try {
    await persistUsers(createAdminAuditEntry({
      action: 'USER_STATUS_CHANGED', entityType: 'USER', entityId: id, before, after: updated,
    }, { now }))
  } catch (error) {
    users[index] = before
    throw error
  }
  return toAdminUser(updated)
}

async function updateAdminUserRoles(id, input, { now = new Date() } = {}) {
  const actor = getAdminActor()
  const index = users.findIndex((user) => user.id === id)
  if (index === -1) throw new AppError('User not found.', 404)
  input = input && typeof input === 'object' ? input : {}
  const roles = Array.isArray(input.roles)
    ? [...new Set(input.roles.filter((role) => typeof role === 'string').map((role) => role.trim()))]
    : null
  const errors = []

  if (!roles || !areValidRoles(roles)) {
    errors.push({ field: 'roles', message: 'One or more roles are invalid.' })
  } else if (users[index].active && roles.length === 0) {
    errors.push({ field: 'roles', message: 'Active users must have at least one role.' })
  } else if (id === actor.id && !roles.includes('ADMIN')) {
    errors.push({ field: 'roles', message: 'The current local Admin user must retain the Admin role.' })
  }
  if (errors.length > 0) throw new ValidationError(errors, 'User role validation failed')

  const before = { ...users[index], roles: [...users[index].roles] }
  const updated = { ...users[index], roles, updatedAt: now.toISOString() }
  users[index] = updated
  try {
    await persistUsers(createAdminAuditEntry({
      action: 'USER_ROLES_CHANGED', entityType: 'USER', entityId: id, before, after: updated,
    }, { now }))
  } catch (error) {
    users[index] = before
    throw error
  }
  return toAdminUser(updated)
}

module.exports = {
  createAdminUser,
  getAdminUser,
  getAdminUsers,
  updateAdminUser,
  updateAdminUserRoles,
  updateAdminUserStatus,
}

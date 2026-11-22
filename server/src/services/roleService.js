const { AppError } = require('../utils/AppError')

const USER_ROLES = [
  'EMPLOYEE',
  'SAFETY',
  'SUPPLY_CHAIN',
  'AREA_MANAGER',
  'ADMIN',
]
const USER_ROLE_SET = new Set(USER_ROLES)

function hasRole(user, role) {
  return Boolean(user?.active && Array.isArray(user.roles) && user.roles.includes(role))
}

function requireRole(user, role) {
  if (!hasRole(user, role)) {
    throw new AppError(`The current user does not have the ${role} role.`, 403)
  }

  return user
}

function areValidRoles(roles) {
  return Array.isArray(roles) && roles.every((role) => USER_ROLE_SET.has(role))
}

module.exports = { USER_ROLES, areValidRoles, hasRole, requireRole }

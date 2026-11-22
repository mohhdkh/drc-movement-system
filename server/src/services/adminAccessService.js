const { getAuthenticatedUser } = require('./authenticationContext')
const { requireRole } = require('./roleService')

function getAdminActor() {
  return requireRole(getAuthenticatedUser(), 'ADMIN')
}

module.exports = { getAdminActor }

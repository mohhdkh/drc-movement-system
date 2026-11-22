const seedData = require('../db/seedData')
const { getOperationalProvider } = require('../db/operationalDatabase')

const provider = getOperationalProvider()
const users = provider.loadUsers()

function persistUsers(audit) {
  return provider.replaceUsers(users.map((user) => ({ ...user, roles: [...user.roles] })), audit)
}

function resetUsers() {
  users.splice(0, users.length, ...seedData.users.map((user) => ({
    ...user,
    roles: [...user.roles],
  })))
  persistUsers()
}

module.exports = { persistUsers, resetUsers, users }

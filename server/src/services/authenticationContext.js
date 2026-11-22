const { AsyncLocalStorage } = require('async_hooks')
const { AppError } = require('../utils/AppError')

const authenticationStorage = new AsyncLocalStorage()

function runWithAuthenticatedUser(user, callback) {
  return authenticationStorage.run(user, callback)
}

function getAuthenticatedUser() {
  const user = authenticationStorage.getStore()
  if (!user) throw new AppError('Authentication is required.', 401)
  return user
}

module.exports = { getAuthenticatedUser, runWithAuthenticatedUser }

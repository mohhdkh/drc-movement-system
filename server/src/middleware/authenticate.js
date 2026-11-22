const { authProvider, nodeEnv } = require('../config/env')
const { getEntraConfig } = require('../config/entra')
const { users } = require('../data/users')
const { runWithAuthenticatedUser } = require('../services/authenticationContext')
const { EntraTokenVerifier } = require('../services/entraTokenVerifier')
const { resolveEntraUser } = require('../services/entraUserService')
const { requireRole } = require('../services/roleService')
const { AppError } = require('../utils/AppError')

let sharedEntraVerifier

function resolveDevelopmentUser(request, defaultUserId) {
  if (nodeEnv === 'production' || authProvider !== 'development') {
    throw new AppError('Development authentication is unavailable.', 401, undefined, 'AUTH_PROVIDER_UNAVAILABLE')
  }

  const remoteAddress = request.socket.remoteAddress || ''
  const isLoopback = remoteAddress === '::1' || remoteAddress === '127.0.0.1' ||
    remoteAddress === '::ffff:127.0.0.1'
  if (!isLoopback) {
    throw new AppError('Development authentication is restricted to localhost.', 403, undefined, 'AUTH_LOOPBACK_REQUIRED')
  }

  const headerUserId = request.get('x-development-user-id')
  const userId = headerUserId?.trim() || defaultUserId
  if (!userId) throw new AppError('Authentication is required.', 401, undefined, 'AUTH_REQUIRED')

  const user = users.find((candidate) => candidate.id === userId)
  if (!user) throw new AppError('The authenticated user is not registered.', 401, undefined, 'ACCOUNT_NOT_LINKED')
  if (!user.active) throw new AppError('The authenticated user is inactive.', 403, undefined, 'ACCOUNT_INACTIVE')
  return user
}

function resolveReviewUser(defaultUserId) {
  const user = users.find((candidate) => candidate.id === defaultUserId)
  if (!user) throw new AppError('The review user is not registered.', 401, undefined, 'ACCOUNT_NOT_LINKED')
  if (!user.active) throw new AppError('The review user is inactive.', 403, undefined, 'ACCOUNT_INACTIVE')
  return user
}

function extractBearerToken(request) {
  const authorization = request.get('authorization') || ''
  const match = authorization.match(/^Bearer ([^\s]+)$/)
  if (!match) throw new AppError('A Microsoft bearer token is required.', 401, undefined, 'AUTH_REQUIRED')
  return match[1]
}

function getEntraVerifier() {
  if (!sharedEntraVerifier) sharedEntraVerifier = new EntraTokenVerifier({ config: getEntraConfig() })
  return sharedEntraVerifier
}

function setEntraTokenVerifierForTests(verifier) {
  sharedEntraVerifier = verifier
}

function authenticate({ developmentUserId = 'emp-001', roles = [], provider = authProvider, tokenVerifier } = {}) {
  return async function authenticationMiddleware(request, _response, next) {
    try {
      let user
      if (provider === 'development') {
        user = resolveDevelopmentUser(request, developmentUserId)
      } else if (provider === 'review') {
        user = resolveReviewUser(developmentUserId)
      } else if (provider === 'entra') {
        const identity = await (tokenVerifier || getEntraVerifier()).verify(extractBearerToken(request))
        user = await resolveEntraUser(identity)
      } else {
        throw new AppError('Authentication provider is unavailable.', 401, undefined, 'AUTH_PROVIDER_UNAVAILABLE')
      }
      for (const role of roles) requireRole(user, role)
      request.user = user
      request.authenticationProvider = provider
      runWithAuthenticatedUser(user, next)
    } catch (error) {
      next(error)
    }
  }
}

module.exports = {
  authenticate,
  extractBearerToken,
  resolveDevelopmentUser,
  resolveReviewUser,
  setEntraTokenVerifierForTests,
}

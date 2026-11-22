const { users } = require('../data/users')
const { getOperationalProvider } = require('../db/operationalDatabase')
const { AppError } = require('../utils/AppError')

function accessError(message, code) {
  return new AppError(message, 403, undefined, code)
}

function matchEntraIdentity(identity, localUsers = users) {
  const linked = localUsers.filter((user) =>
    user.entraObjectId?.toLowerCase() === identity.objectId &&
    user.entraTenantId?.toLowerCase() === identity.tenantId)
  if (linked.length > 1) throw accessError('Microsoft account mapping is ambiguous.', 'ACCOUNT_LINK_AMBIGUOUS')
  if (linked.length === 1) return { user: linked[0], needsLink: false }
  if (!identity.principalName) throw accessError('Microsoft account is not linked.', 'ACCOUNT_NOT_LINKED')

  const emailMatches = localUsers.filter((user) =>
    user.email?.trim().toLowerCase() === identity.principalName)
  if (emailMatches.length !== 1) {
    throw accessError(
      emailMatches.length ? 'Microsoft account mapping is ambiguous.' : 'Microsoft account is not linked.',
      emailMatches.length ? 'ACCOUNT_LINK_AMBIGUOUS' : 'ACCOUNT_NOT_LINKED',
    )
  }
  const user = emailMatches[0]
  if (user.entraObjectId || user.entraTenantId) {
    throw accessError('Local account is linked to another Microsoft identity.', 'ACCOUNT_LINK_CONFLICT')
  }
  return { user, needsLink: true }
}

async function resolveEntraUser(identity, options = {}) {
  const localUsers = options.localUsers || users
  const match = matchEntraIdentity(identity, localUsers)
  if (!match.user.active) throw accessError('The linked local account is inactive.', 'ACCOUNT_INACTIVE')
  if (!match.needsLink) return match.user

  const now = options.now || new Date()
  const updatedAt = now.toISOString()
  const audit = {
    timestamp: updatedAt,
    actorId: match.user.id,
    actorName: match.user.name,
    action: 'ENTRA_ACCOUNT_LINKED',
    entityType: 'USER',
    entityId: match.user.id,
    before: { entraLinked: false },
    after: { entraLinked: true, principalName: identity.principalName },
  }
  const linkIdentity = options.linkIdentity || ((userId, value, entry) =>
    getOperationalProvider().linkUserEntraIdentity(userId, value, entry))
  let linked
  try {
    linked = await linkIdentity(match.user.id, { ...identity, updatedAt }, audit)
  } catch (error) {
    if (error?.code === '23505' || String(error?.code || '').startsWith('SQLITE_CONSTRAINT')) {
      throw accessError('Microsoft account is already linked.', 'ACCOUNT_LINK_CONFLICT')
    }
    throw error
  }
  const index = localUsers.findIndex((user) => user.id === match.user.id)
  if (index !== -1) localUsers[index] = linked
  return linked
}

module.exports = { matchEntraIdentity, resolveEntraUser }

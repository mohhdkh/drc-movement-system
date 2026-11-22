const { getAdminAuditEntries } = require('../services/adminAuditService')
const {
  createAdminResource,
  getAdminResource,
  getAdminSummary,
  listAdminResources,
  updateAdminResource,
  updateAdminResourceStatus,
} = require('../services/adminMasterDataService')
const {
  getAdminSettings,
  updateAdminSettings,
} = require('../services/adminSettingsService')
const {
  createAdminUser,
  getAdminUser,
  getAdminUsers,
  updateAdminUser,
  updateAdminUserRoles,
  updateAdminUserStatus,
} = require('../services/adminUserService')
const {
  getSharePointStatus,
  syncSnapshotIfEnabled,
} = require('../services/institutionalPersistenceService')
const { getOperationalDatabaseStatus } = require('../db/operationalDatabase')
const { authProvider } = require('../config/env')
const { getEntraStatus } = require('../config/entra')

function summary(_request, response) {
  response.json({ data: getAdminSummary() })
}

function listUsers(_request, response) {
  response.json({ data: getAdminUsers() })
}

function getUser(request, response) {
  response.json({ data: getAdminUser(request.params.id) })
}

async function createUser(request, response) {
  const data = await createAdminUser(request.body)
  await syncSnapshotIfEnabled()
  response.status(201).json({ data })
}

async function updateUser(request, response) {
  const data = await updateAdminUser(request.params.id, request.body)
  await syncSnapshotIfEnabled()
  response.json({ data })
}

async function updateUserStatus(request, response) {
  const data = await updateAdminUserStatus(request.params.id, request.body)
  await syncSnapshotIfEnabled()
  response.json({ data })
}

async function updateUserRoles(request, response) {
  const data = await updateAdminUserRoles(request.params.id, request.body)
  await syncSnapshotIfEnabled()
  response.json({ data })
}

function listResources(request, response) {
  response.json({ data: listAdminResources(request.params.resource) })
}

function getResource(request, response) {
  response.json({ data: getAdminResource(request.params.resource, request.params.id) })
}

async function createResource(request, response) {
  const data = await createAdminResource(request.params.resource, request.body)
  await syncSnapshotIfEnabled()
  response.status(201).json({ data })
}

async function updateResource(request, response) {
  const data = await updateAdminResource(request.params.resource, request.params.id, request.body)
  await syncSnapshotIfEnabled()
  response.json({ data })
}

async function updateResourceStatus(request, response) {
  const data = await updateAdminResourceStatus(request.params.resource, request.params.id, request.body)
  await syncSnapshotIfEnabled()
  response.json({ data })
}

function getSettings(_request, response) {
  response.json({ data: getAdminSettings() })
}

async function updateSettings(request, response) {
  const data = await updateAdminSettings(request.body)
  await syncSnapshotIfEnabled()
  response.json({ data })
}

async function sharePointStatus(_request, response) {
  response.json({ data: await getSharePointStatus() })
}

async function databaseStatus(_request, response) {
  response.json({ data: await getOperationalDatabaseStatus() })
}

function entraStatus(_request, response) {
  response.json({ data: getEntraStatus(authProvider) })
}

function listAuditLog(request, response) {
  response.json({
    data: getAdminAuditEntries({
      entityType: request.query.entityType,
      action: request.query.action,
    }),
  })
}

module.exports = {
  createResource,
  createUser,
  databaseStatus,
  entraStatus,
  getResource,
  getSettings,
  getUser,
  listAuditLog,
  listResources,
  listUsers,
  summary,
  sharePointStatus,
  updateResource,
  updateResourceStatus,
  updateSettings,
  updateUser,
  updateUserRoles,
  updateUserStatus,
}

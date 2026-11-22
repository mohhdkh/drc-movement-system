const express = require('express')
const {
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
} = require('../controllers/adminController')
const { authenticate } = require('../middleware/authenticate')

const router = express.Router()

router.use(authenticate({ developmentUserId: 'emp-002', roles: ['ADMIN'] }))

router.get('/summary', summary)
router.get('/integrations/sharepoint/status', sharePointStatus)
router.get('/integrations/entra/status', entraStatus)
router.get('/system/database-status', databaseStatus)

router.get('/users', listUsers)
router.post('/users', createUser)
router.get('/users/:id', getUser)
router.patch('/users/:id', updateUser)
router.patch('/users/:id/status', updateUserStatus)
router.patch('/users/:id/roles', updateUserRoles)

router.get('/settings', getSettings)
router.patch('/settings', updateSettings)
router.get('/audit-log', listAuditLog)

router.get('/:resource', listResources)
router.post('/:resource', createResource)
router.get('/:resource/:id', getResource)
router.patch('/:resource/:id', updateResource)
router.patch('/:resource/:id/status', updateResourceStatus)

module.exports = router

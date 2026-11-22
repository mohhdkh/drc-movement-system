const safetyReviewService = require('../services/safetyReviewService')
const { listFinalApprovedMovementsByDate } = require('../services/whatsAppMovementService')
const { syncMovementIfEnabled } = require('../services/institutionalPersistenceService')

function listSafetyMovements(request, response) {
  response.json({
    data: safetyReviewService.listSafetyMovements({ status: request.query.status }),
  })
}

function getSafetyMovement(request, response) {
  response.json({ data: safetyReviewService.getSafetyMovement(request.params.id) })
}

function listFinalApprovedMovements(request, response) {
  response.set('Cache-Control', 'no-store')
  response.json({ data: listFinalApprovedMovementsByDate(request.query.date) })
}

async function submitSafetyReview(request, response) {
  const movement = await safetyReviewService.submitSafetyReview(request.params.id, request.body, {
    actor: request.user,
  })
  await syncMovementIfEnabled(movement)
  response.json({ data: movement })
}

module.exports = {
  getSafetyMovement,
  listFinalApprovedMovements,
  listSafetyMovements,
  submitSafetyReview,
}

const areaManagerReviewService = require('../services/areaManagerReviewService')
const { syncMovementIfEnabled } = require('../services/institutionalPersistenceService')

function listAreaManagerMovements(request, response) {
  response.json({
    data: areaManagerReviewService.listAreaManagerMovements({ status: request.query.status }),
  })
}

function getAreaManagerMovement(request, response) {
  response.json({
    data: areaManagerReviewService.getAreaManagerMovement(request.params.id),
  })
}

async function submitAreaManagerReview(request, response) {
  const movement = await areaManagerReviewService.submitAreaManagerReview(request.params.id, request.body, {
    actor: request.user,
  })
  await syncMovementIfEnabled(movement)
  response.json({ data: movement })
}

module.exports = {
  getAreaManagerMovement,
  listAreaManagerMovements,
  submitAreaManagerReview,
}

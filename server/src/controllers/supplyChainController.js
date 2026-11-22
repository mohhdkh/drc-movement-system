const assignmentService = require('../services/supplyChainAssignmentService')
const { syncMovementIfEnabled } = require('../services/institutionalPersistenceService')

function listSupplyChainMovements(request, response) {
  response.json({
    data: assignmentService.listSupplyChainMovements({ status: request.query.status }),
  })
}

function getSupplyChainMovement(request, response) {
  response.json({ data: assignmentService.getSupplyChainMovement(request.params.id) })
}

async function submitSupplyChainAssignment(request, response) {
  const movement = await assignmentService.submitSupplyChainAssignment(request.params.id, request.body, {
    actor: request.user,
  })
  await syncMovementIfEnabled(movement)
  response.json({ data: movement })
}

module.exports = {
  getSupplyChainMovement,
  listSupplyChainMovements,
  submitSupplyChainAssignment,
}

const movementService = require('../services/movementService')
const { syncMovementIfEnabled } = require('../services/institutionalPersistenceService')

function listMovements(request, response) {
  const movements = movementService.listMovements({
    requesterId: request.user.id,
  })
  response.json({ data: movements })
}

function getMovement(request, response) {
  response.json({
    data: movementService.getEmployeeMovement(request.params.id, request.user),
  })
}

async function createMovement(request, response) {
  const movement = await movementService.createMovement(request.body, { actor: request.user })
  await syncMovementIfEnabled(movement)
  response.locals.entityId = movement.id
  response.status(201).json({ data: movement })
}

async function updateMovement(request, response) {
  const movement = await movementService.updateEmployeeMovement(request.params.id, request.body, {
    actor: request.user,
  })
  await syncMovementIfEnabled(movement)
  response.locals.entityId = movement.id
  response.json({ data: movement })
}

module.exports = { createMovement, getMovement, listMovements, updateMovement }

const { getOperationalProvider } = require('../db/operationalDatabase')

const provider = getOperationalProvider()

let movements = provider.loadMovements()

function listMovements() {
  return [...movements].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

function findMovementById(id) {
  return movements.find((movement) => movement.id === id)
}

function saveMovement(movement, transition) {
  const persisted = provider.writeMovement(movement, transition)
  if (persisted?.then) {
    return persisted.then(() => {
      movements.push(movement)
      return movement
    })
  }
  movements.push(movement)
  return movement
}

function replaceMovement(movement, transition) {
  const index = movements.findIndex((item) => item.id === movement.id)
  if (index === -1) return undefined
  const persisted = provider.writeMovement(movement, transition)
  if (persisted?.then) {
    return persisted.then(() => {
      const currentIndex = movements.findIndex((item) => item.id === movement.id)
      if (currentIndex !== -1) movements[currentIndex] = movement
      return movement
    })
  }
  movements[index] = movement
  return movement
}

function reloadMovements() {
  movements = provider.loadMovements()
  return listMovements()
}

function resetMovements() {
  const persisted = provider.resetStoredMovements()
  if (persisted?.then) return persisted.then(() => { movements = [] })
  movements = []
}

module.exports = {
  findMovementById,
  listMovements,
  reloadMovements,
  replaceMovement,
  resetMovements,
  saveMovement,
}

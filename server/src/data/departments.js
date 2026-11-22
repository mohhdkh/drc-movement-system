const seedData = require('../db/seedData')
const { getOperationalProvider } = require('../db/operationalDatabase')

const provider = getOperationalProvider()

const departments = provider.loadResources('departments')

function persistDepartments(audit) {
  return provider.replaceResources('departments', departments.map((item) => ({ ...item })), audit)
}

function resetDepartments() {
  departments.splice(0, departments.length, ...seedData.departments.map((item) => ({ ...item })))
  persistDepartments()
}

module.exports = { departments, persistDepartments, resetDepartments }

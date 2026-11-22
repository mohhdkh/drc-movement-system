const { listEmployees: listEmployeeDirectory } = require('../data/employees')

function listEmployees(_request, response) {
  response.json({ data: listEmployeeDirectory() })
}

module.exports = { listEmployees }

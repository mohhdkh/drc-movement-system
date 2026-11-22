const { departments } = require('./departments')
const { users } = require('./users')

function listEmployees() {
  const departmentNames = new Map(departments.map((department) => [department.id, department.name]))

  return users
    .filter((user) => user.active && user.roles.includes('EMPLOYEE'))
    .map((user) => ({
      id: user.id,
      displayName: user.name,
      email: user.email,
      department: user.departmentId
        ? departmentNames.get(user.departmentId) ?? 'Unknown department'
        : undefined,
      role: 'EMPLOYEE',
      isActive: user.active,
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName, undefined, { sensitivity: 'base' }))
}

module.exports = { listEmployees }

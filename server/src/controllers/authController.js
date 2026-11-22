const { departments } = require('../data/departments')

function getCurrentUser(request, response) {
  const { id, name, email, phone, departmentId, roles, active } = request.user
  const department = departments.find((item) => item.id === departmentId)
  response.json({
    data: {
      id,
      name,
      email,
      phone,
      departmentId,
      department: department?.name ?? null,
      roles: [...roles],
      active,
      authenticationProvider: request.authenticationProvider,
    },
  })
}

module.exports = { getCurrentUser }

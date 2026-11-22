function notFound(request, response) {
  response.status(404).json({
    status: 'error',
    code: 'ROUTE_NOT_FOUND',
    message: `API route not found: ${request.method} ${request.path}`,
    requestId: request.id,
  })
}

module.exports = { notFound }

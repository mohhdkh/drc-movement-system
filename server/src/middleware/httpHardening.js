const { AppError } = require('../utils/AppError')

function requireJsonContentType(request, _response, next) {
  if (['POST', 'PUT', 'PATCH'].includes(request.method) &&
      request.headers['content-length'] !== '0' && !request.is('application/json')) {
    return next(new AppError('Content-Type must be application/json.', 415, undefined, 'UNSUPPORTED_MEDIA_TYPE'))
  }
  next()
}

module.exports = { requireJsonContentType }

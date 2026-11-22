const { timingSafeEqual } = require('crypto')

function safeEqual(leftValue, rightValue) {
  const left = Buffer.from(String(leftValue))
  const right = Buffer.from(String(rightValue))
  return left.length === right.length && timingSafeEqual(left, right)
}

function decodeBasicCredentials(authorization = '') {
  const match = authorization.match(/^Basic ([A-Za-z0-9+/]+={0,2})$/)
  if (!match) return null
  let decoded
  try {
    decoded = Buffer.from(match[1], 'base64').toString('utf8')
  } catch {
    return null
  }
  const separator = decoded.indexOf(':')
  if (separator < 1) return null
  return {
    username: decoded.slice(0, separator),
    password: decoded.slice(separator + 1),
  }
}

function createReviewAccess(config) {
  if (config.authProvider !== 'review') return (_request, _response, next) => next()

  return function reviewAccess(request, response, next) {
    const credentials = decodeBasicCredentials(request.get('authorization'))
    if (credentials &&
        safeEqual(credentials.username, config.reviewAccessUsername) &&
        safeEqual(credentials.password, config.reviewAccessPassword)) {
      return next()
    }

    response.set('WWW-Authenticate', 'Basic realm="DRC Movement Review", charset="UTF-8"')
    return response.status(401).send('Authentication is required for this review environment.')
  }
}

module.exports = { createReviewAccess, decodeBasicCredentials, safeEqual }

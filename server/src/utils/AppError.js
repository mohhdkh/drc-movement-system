class AppError extends Error {
  constructor(message, statusCode, details, code) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.details = details
    this.code = code || 'REQUEST_ERROR'
  }
}

class ValidationError extends AppError {
  constructor(details, message = 'Movement request validation failed') {
    super(message, 400, details, 'VALIDATION_ERROR')
    this.name = 'ValidationError'
  }
}

module.exports = { AppError, ValidationError }

class GraphIntegrationError extends Error {
  constructor(message, { code = 'GRAPH_ERROR', statusCode = 502, retryable = false, details } = {}) {
    super(message)
    this.name = 'GraphIntegrationError'
    this.code = code
    this.statusCode = statusCode
    this.retryable = retryable
    this.details = details
  }
}

module.exports = { GraphIntegrationError }

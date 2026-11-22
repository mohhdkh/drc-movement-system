const axios = require('axios')
const { GraphIntegrationError } = require('./GraphIntegrationError')

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0'

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function graphError(error) {
  const status = error.response?.status
  const graphCode = error.response?.data?.error?.code
  const messages = {
    401: 'Microsoft Graph rejected the application token.',
    403: 'Microsoft Graph denied access. Verify application permissions and admin consent.',
    404: 'The requested SharePoint site, list, or item was not found.',
    409: 'Microsoft Graph reported a SharePoint conflict.',
    429: 'Microsoft Graph throttled the request.',
  }
  const retryable = status === 429 || status >= 500 ||
    ['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET'].includes(error.code)
  return new GraphIntegrationError(
    messages[status] || (retryable
      ? 'Microsoft Graph is temporarily unavailable.'
      : 'Microsoft Graph request failed.'),
    {
      code: graphCode || (status ? `GRAPH_HTTP_${status}` : 'GRAPH_NETWORK_ERROR'),
      statusCode: status === 403 ? 502 : status === 404 ? 502 : 502,
      retryable,
      details: { upstreamStatus: status || null },
    },
  )
}

class GraphClient {
  constructor({
    tokenClient,
    transport = axios,
    sleep = delay,
    maxRetries = 3,
    timeoutMs = 15000,
  }) {
    this.tokenClient = tokenClient
    this.transport = transport
    this.sleep = sleep
    this.maxRetries = maxRetries
    this.timeoutMs = timeoutMs
  }

  async request({ method = 'GET', path, url, data, headers = {} }) {
    let refreshedAfterUnauthorized = false
    for (let attempt = 0; ; attempt += 1) {
      const token = await this.tokenClient.getAccessToken()
      try {
        const response = await this.transport.request({
          method,
          url: url || `${GRAPH_BASE_URL}${path}`,
          data,
          timeout: this.timeoutMs,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            ...headers,
          },
        })
        return response.data
      } catch (error) {
        const status = error.response?.status
        if (status === 401 && !refreshedAfterUnauthorized) {
          refreshedAfterUnauthorized = true
          this.tokenClient.invalidate()
          continue
        }

        const normalized = graphError(error)
        if (!normalized.retryable || attempt >= this.maxRetries) throw normalized
        const retryAfter = Number(error.response?.headers?.['retry-after'])
        const waitMs = Number.isFinite(retryAfter) && retryAfter >= 0
          ? retryAfter * 1000
          : Math.min(1000 * (2 ** attempt), 10000)
        await this.sleep(waitMs)
      }
    }
  }

  async getAll(path) {
    const values = []
    let nextPath = path
    let nextUrl
    while (nextPath || nextUrl) {
      const page = await this.request({ path: nextPath, url: nextUrl })
      values.push(...(Array.isArray(page.value) ? page.value : []))
      nextUrl = page['@odata.nextLink'] || null
      nextPath = null
    }
    return values
  }
}

module.exports = { GRAPH_BASE_URL, GraphClient, graphError }

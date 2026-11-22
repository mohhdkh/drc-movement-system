const axios = require('axios')
const { GraphIntegrationError } = require('./GraphIntegrationError')

const GRAPH_SCOPE = 'https://graph.microsoft.com/.default'

class GraphTokenClient {
  constructor({ tenantId, clientId, clientSecret, transport = axios, now = () => Date.now() }) {
    this.tenantId = tenantId
    this.clientId = clientId
    this.clientSecret = clientSecret
    this.transport = transport
    this.now = now
    this.cachedToken = null
  }

  validateConfiguration() {
    const missing = [
      ['MS_TENANT_ID', this.tenantId],
      ['MS_CLIENT_ID', this.clientId],
      ['MS_CLIENT_SECRET', this.clientSecret],
    ].filter(([, value]) => !value).map(([name]) => name)
    if (missing.length) {
      throw new GraphIntegrationError(
        `Microsoft Graph configuration is incomplete: ${missing.join(', ')}.`,
        { code: 'GRAPH_CONFIG_INVALID', statusCode: 503 },
      )
    }
  }

  invalidate() {
    this.cachedToken = null
  }

  async getAccessToken() {
    this.validateConfiguration()
    if (this.cachedToken && this.cachedToken.expiresAt - 60000 > this.now()) {
      return this.cachedToken.value
    }

    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'client_credentials',
      scope: GRAPH_SCOPE,
    }).toString()

    try {
      const response = await this.transport.post(
        `https://login.microsoftonline.com/${encodeURIComponent(this.tenantId)}/oauth2/v2.0/token`,
        body,
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 15000,
        },
      )
      const accessToken = response.data?.access_token
      const expiresIn = Number(response.data?.expires_in)
      if (!accessToken || !Number.isFinite(expiresIn)) throw new Error('Token response is incomplete.')
      this.cachedToken = {
        value: accessToken,
        expiresAt: this.now() + expiresIn * 1000,
      }
      return accessToken
    } catch (error) {
      throw new GraphIntegrationError('Microsoft Graph application authentication failed.', {
        code: 'GRAPH_AUTH_FAILED',
        statusCode: 502,
        details: { upstreamStatus: error.response?.status || null },
      })
    }
  }
}

module.exports = { GRAPH_SCOPE, GraphTokenClient }

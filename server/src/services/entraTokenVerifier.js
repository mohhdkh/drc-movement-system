const { getEntraConfig, GUID_PATTERN, validateEntraConfig } = require('../config/entra')
const { AppError } = require('../utils/AppError')

const MAX_METADATA_BYTES = 1024 * 1024

function authenticationError(code = 'AUTH_TOKEN_INVALID') {
  return new AppError('Microsoft access token is invalid or expired.', 401, undefined, code)
}

async function fetchJsonWithRetry(url, options = {}) {
  const fetchImpl = options.fetchImpl || fetch
  const attempts = options.attempts || 3
  const timeoutMs = options.timeoutMs || 5000
  const sleep = options.sleep || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)))
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl(url, {
        headers: { Accept: 'application/json' },
        redirect: 'error',
        signal: controller.signal,
      })
      if (!response.ok) {
        const error = new Error(`Identity metadata request failed with HTTP ${response.status}.`)
        error.retryable = response.status === 429 || response.status >= 500
        throw error
      }
      const length = Number(response.headers?.get?.('content-length') || 0)
      if (length > MAX_METADATA_BYTES) throw new Error('Identity metadata response is too large.')
      const text = await response.text()
      if (Buffer.byteLength(text) > MAX_METADATA_BYTES) throw new Error('Identity metadata response is too large.')
      return JSON.parse(text)
    } catch (error) {
      lastError = error
      const retryable = error.name === 'AbortError' || error.retryable === true || error instanceof TypeError
      if (!retryable || attempt === attempts) break
      await sleep(Math.min(250 * (2 ** (attempt - 1)), 1000))
    } finally {
      clearTimeout(timeout)
    }
  }
  const unavailable = new AppError(
    'Microsoft identity metadata is temporarily unavailable.',
    503,
    undefined,
    'ENTRA_METADATA_UNAVAILABLE',
  )
  unavailable.cause = lastError
  throw unavailable
}

function createMicrosoftJwksLoader(config, options = {}) {
  return async function loadMicrosoftJwks() {
    const metadata = await fetchJsonWithRetry(config.metadataUrl, {
      ...options,
      attempts: config.networkRetries,
      timeoutMs: config.networkTimeoutMs,
    })
    if (metadata.issuer !== config.issuer || typeof metadata.jwks_uri !== 'string') {
      throw new AppError('Microsoft identity metadata is invalid.', 503, undefined, 'ENTRA_METADATA_INVALID')
    }
    const metadataUrl = new URL(config.metadataUrl)
    const jwksUrl = new URL(metadata.jwks_uri)
    if (jwksUrl.protocol !== 'https:' || jwksUrl.origin !== metadataUrl.origin) {
      throw new AppError('Microsoft identity signing-key endpoint is invalid.', 503, undefined, 'ENTRA_METADATA_INVALID')
    }
    const jwks = await fetchJsonWithRetry(jwksUrl, {
      ...options,
      attempts: config.networkRetries,
      timeoutMs: config.networkTimeoutMs,
    })
    if (!Array.isArray(jwks.keys)) {
      throw new AppError('Microsoft identity signing keys are invalid.', 503, undefined, 'ENTRA_METADATA_INVALID')
    }
    return jwks
  }
}

class EntraTokenVerifier {
  constructor(options = {}) {
    this.config = options.config || getEntraConfig()
    const errors = validateEntraConfig(this.config)
    if (errors.length) throw new Error(`Entra configuration is incomplete: ${errors.join(', ')}.`)
    this.loadJwks = options.loadJwks || createMicrosoftJwksLoader(this.config, options)
    this.now = options.now || (() => Date.now())
    this.resolver = null
    this.loadedAt = 0
    this.lastForcedRefresh = 0
  }

  async loadResolver(force = false) {
    const now = this.now()
    const fresh = this.resolver && now - this.loadedAt < this.config.jwksCacheMs
    if (!force && fresh) return this.resolver
    if (force && this.resolver && now - this.lastForcedRefresh < this.config.jwksRefreshCooldownMs) {
      return this.resolver
    }
    if (force) this.lastForcedRefresh = now
    const { createLocalJWKSet } = await import('jose')
    this.resolver = createLocalJWKSet(await this.loadJwks())
    this.loadedAt = now
    return this.resolver
  }

  async verify(token) {
    if (typeof token !== 'string' || token.length < 20 || token.length > 16384) throw authenticationError()
    const { jwtVerify } = await import('jose')
    const verifyWith = async (resolver) => jwtVerify(token, resolver, {
      algorithms: ['RS256'],
      audience: this.config.audience,
      issuer: this.config.issuer,
      requiredClaims: ['aud', 'exp', 'iat', 'iss', 'nbf', 'oid', 'tid'],
      clockTolerance: 5,
      currentDate: new Date(this.now()),
    })

    try {
      let resolver = await this.loadResolver()
      let result
      try {
        result = await verifyWith(resolver)
      } catch (error) {
        if (error?.code !== 'ERR_JWKS_NO_MATCHING_KEY') throw error
        resolver = await this.loadResolver(true)
        result = await verifyWith(resolver)
      }
      const payload = result.payload
      if (String(payload.tid || '').toLowerCase() !== this.config.allowedTenantId ||
          !GUID_PATTERN.test(String(payload.oid || ''))) {
        throw authenticationError()
      }
      const principalName = [payload.preferred_username, payload.upn, payload.email]
        .find((value) => typeof value === 'string' && value.trim())
      return {
        objectId: String(payload.oid).toLowerCase(),
        tenantId: String(payload.tid).toLowerCase(),
        principalName: principalName ? principalName.trim().toLowerCase() : null,
        displayName: typeof payload.name === 'string' ? payload.name : null,
      }
    } catch (error) {
      if (error instanceof AppError) throw error
      throw authenticationError()
    }
  }
}

module.exports = {
  EntraTokenVerifier,
  authenticationError,
  createMicrosoftJwksLoader,
  fetchJsonWithRetry,
}

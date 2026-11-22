const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function positiveInteger(value, fallback, name) {
  const parsed = value === undefined || value === '' ? fallback : Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer.`)
  return parsed
}

function getEntraConfig(environment = process.env) {
  const tenantId = String(environment.ENTRA_TENANT_ID || '').trim().toLowerCase()
  const issuer = String(environment.ENTRA_ISSUER || '').trim()
  return {
    tenantId,
    allowedTenantId: String(environment.ENTRA_ALLOWED_TENANT_ID || tenantId).trim().toLowerCase(),
    clientId: String(environment.ENTRA_CLIENT_ID || '').trim(),
    audience: String(environment.ENTRA_AUDIENCE || '').trim(),
    issuer,
    metadataUrl: issuer ? `${issuer.replace(/\/+$/, '')}/.well-known/openid-configuration` : '',
    networkTimeoutMs: positiveInteger(environment.ENTRA_NETWORK_TIMEOUT_MS, 5000, 'ENTRA_NETWORK_TIMEOUT_MS'),
    networkRetries: positiveInteger(environment.ENTRA_NETWORK_RETRIES, 3, 'ENTRA_NETWORK_RETRIES'),
    jwksCacheMs: positiveInteger(environment.ENTRA_JWKS_CACHE_MS, 10 * 60 * 1000, 'ENTRA_JWKS_CACHE_MS'),
    jwksRefreshCooldownMs: positiveInteger(
      environment.ENTRA_JWKS_REFRESH_COOLDOWN_MS,
      30000,
      'ENTRA_JWKS_REFRESH_COOLDOWN_MS',
    ),
  }
}

function validateEntraConfig(config) {
  const missing = []
  if (!config.tenantId) missing.push('ENTRA_TENANT_ID')
  if (!config.clientId) missing.push('ENTRA_CLIENT_ID')
  if (!config.audience) missing.push('ENTRA_AUDIENCE')
  if (!config.issuer) missing.push('ENTRA_ISSUER')
  if (!config.allowedTenantId) missing.push('ENTRA_ALLOWED_TENANT_ID')
  if (missing.length) return missing
  if (!GUID_PATTERN.test(config.tenantId)) return ['ENTRA_TENANT_ID must be a tenant GUID']
  if (!GUID_PATTERN.test(config.allowedTenantId)) return ['ENTRA_ALLOWED_TENANT_ID must be a tenant GUID']
  let issuer
  try { issuer = new URL(config.issuer) } catch { return ['ENTRA_ISSUER must be a valid HTTPS URL'] }
  if (issuer.protocol !== 'https:' || issuer.username || issuer.password || issuer.search || issuer.hash) {
    return ['ENTRA_ISSUER must be a credential-free HTTPS URL']
  }
  return []
}

function getEntraStatus(authProvider, environment = process.env) {
  const config = getEntraConfig(environment)
  const errors = validateEntraConfig(config)
  return {
    enabled: authProvider === 'entra',
    configured: errors.length === 0,
    tenantConfigured: Boolean(config.tenantId && config.allowedTenantId),
    clientIdConfigured: Boolean(config.clientId),
    audienceConfigured: Boolean(config.audience),
    issuerConfigured: Boolean(config.issuer),
    metadata: 'not-tested',
    authProvider,
  }
}

module.exports = { GUID_PATTERN, getEntraConfig, getEntraStatus, validateEntraConfig }

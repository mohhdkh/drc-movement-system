function enabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase())
}

function getSharePointConfig(environment = process.env) {
  return {
    enabled: enabled(environment.MS_SHAREPOINT_ENV_ENABLED),
    tenantId: environment.MS_TENANT_ID || '',
    clientId: environment.MS_CLIENT_ID || '',
    clientSecret: environment.MS_CLIENT_SECRET || '',
    hostname: environment.MS_SHAREPOINT_HOSTNAME || '',
    sitePath: environment.MS_SHAREPOINT_SITE_PATH || '',
    siteId: environment.MS_SHAREPOINT_SITE_ID || '',
    driveId: environment.MS_SHAREPOINT_DRIVE_ID || '',
  }
}

function validateSharePointConfig(config, { requireCredentials = true } = {}) {
  if (!config.enabled) return []
  const missing = []
  if (requireCredentials) {
    if (!config.tenantId) missing.push('MS_TENANT_ID')
    if (!config.clientId) missing.push('MS_CLIENT_ID')
    if (!config.clientSecret) missing.push('MS_CLIENT_SECRET')
  }
  if (!config.siteId && !config.hostname) missing.push('MS_SHAREPOINT_HOSTNAME or MS_SHAREPOINT_SITE_ID')
  if (!config.siteId && !config.sitePath) missing.push('MS_SHAREPOINT_SITE_PATH or MS_SHAREPOINT_SITE_ID')
  return missing
}

module.exports = { getSharePointConfig, validateSharePointConfig }

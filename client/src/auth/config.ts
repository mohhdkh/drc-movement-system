export type BrowserAuthProvider = 'development' | 'entra'

const configuredProvider = (import.meta.env.VITE_AUTH_PROVIDER || 'development').trim().toLowerCase()

export const browserAuthProvider: BrowserAuthProvider = configuredProvider === 'entra'
  ? 'entra'
  : 'development'

export const entraBrowserConfig = {
  clientId: (import.meta.env.VITE_ENTRA_CLIENT_ID || '').trim(),
  tenantId: (import.meta.env.VITE_ENTRA_TENANT_ID || '').trim(),
  redirectUri: (import.meta.env.VITE_ENTRA_REDIRECT_URI || window.location.origin).trim(),
  apiScope: (import.meta.env.VITE_ENTRA_API_SCOPE || '').trim(),
}

export function validateBrowserAuthConfig() {
  if (configuredProvider !== 'development' && configuredProvider !== 'entra') {
    return ['VITE_AUTH_PROVIDER']
  }
  if (browserAuthProvider !== 'entra') return []
  const missing: string[] = []
  if (!entraBrowserConfig.clientId) missing.push('VITE_ENTRA_CLIENT_ID')
  if (!entraBrowserConfig.tenantId) missing.push('VITE_ENTRA_TENANT_ID')
  if (!entraBrowserConfig.redirectUri) missing.push('VITE_ENTRA_REDIRECT_URI')
  if (!entraBrowserConfig.apiScope) missing.push('VITE_ENTRA_API_SCOPE')
  return missing
}

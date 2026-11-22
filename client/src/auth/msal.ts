import {
  BrowserCacheLocation,
  PublicClientApplication,
  type AccountInfo,
  type IPublicClientApplication,
} from '@azure/msal-browser'
import { entraBrowserConfig } from './config'

export function createMsalInstance() {
  return new PublicClientApplication({
    auth: {
      clientId: entraBrowserConfig.clientId,
      authority: `https://login.microsoftonline.com/${entraBrowserConfig.tenantId}`,
      redirectUri: entraBrowserConfig.redirectUri,
      postLogoutRedirectUri: entraBrowserConfig.redirectUri,
    },
    cache: {
      cacheLocation: BrowserCacheLocation.SessionStorage,
    },
  })
}

export function selectAccount(instance: IPublicClientApplication): AccountInfo | null {
  return instance.getActiveAccount() || instance.getAllAccounts()[0] || null
}

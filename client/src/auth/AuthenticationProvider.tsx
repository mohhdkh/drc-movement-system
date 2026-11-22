import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { InteractionRequiredAuthError, InteractionStatus } from '@azure/msal-browser'
import { useIsAuthenticated, useMsal } from '@azure/msal-react'
import { ApiRequestError, configureAccessTokenProvider, fetchCurrentUser } from '../services/api'
import type { AuthenticatedUser } from '../types'
import { browserAuthProvider, entraBrowserConfig } from './config'
import { selectAccount } from './msal'
import { AuthenticationContext, type AuthenticationContextValue } from './AuthenticationContext'

function AuthenticationState({ title, message, action }: {
  title: string
  message: string
  action?: ReactNode
}) {
  return (
    <main className="authentication-page">
      <div className="authentication-panel">
        <span className="brand-mark" aria-hidden="true">DRC</span>
        <h1>{title}</h1>
        <p>{message}</p>
        {action}
      </div>
    </main>
  )
}

function EntraAuthenticationProvider({ children }: { children: ReactNode }) {
  const { instance, inProgress } = useMsal()
  const isAuthenticated = useIsAuthenticated()
  const [user, setUser] = useState<AuthenticatedUser | null>(null)
  const [error, setError] = useState('')
  const [retryKey, setRetryKey] = useState(0)
  const account = selectAccount(instance)

  useEffect(() => {
    if (!account || !isAuthenticated || inProgress !== InteractionStatus.None) return
    instance.setActiveAccount(account)
    configureAccessTokenProvider(async () => {
      try {
        const result = await instance.acquireTokenSilent({
          account,
          scopes: [entraBrowserConfig.apiScope],
        })
        return result.accessToken
      } catch (tokenError) {
        if (tokenError instanceof InteractionRequiredAuthError) {
          await instance.acquireTokenRedirect({
            account,
            scopes: [entraBrowserConfig.apiScope],
            redirectUri: entraBrowserConfig.redirectUri,
          })
          throw new ApiRequestError('Microsoft sign-in is required.', [], 'AUTH_REQUIRED', 401)
        }
        throw tokenError
      }
    })
    let current = true
    fetchCurrentUser()
      .then((authenticatedUser) => {
        if (current) {
          setError('')
          setUser(authenticatedUser)
        }
      })
      .catch((loadError: unknown) => {
        if (current) {
          setError(loadError instanceof Error ? loadError.message : 'Your local account could not be loaded.')
        }
      })
    return () => {
      current = false
      configureAccessTokenProvider()
    }
  }, [account, inProgress, instance, isAuthenticated, retryKey])

  async function signIn() {
    await instance.loginRedirect({
      scopes: [entraBrowserConfig.apiScope],
      redirectUri: entraBrowserConfig.redirectUri,
    })
  }

  const signOut = useCallback(async () => {
    configureAccessTokenProvider()
    await instance.logoutRedirect({ account: account || undefined })
  }, [account, instance])

  const context = useMemo<AuthenticationContextValue>(() => ({ provider: 'entra', user, signOut }), [signOut, user])

  if (inProgress !== InteractionStatus.None) {
    return <AuthenticationState title="Signing in" message="Completing Microsoft authentication..." />
  }
  if (!isAuthenticated || !account) {
    return (
      <AuthenticationState
        title="Movement System"
        message="Use your DRC Microsoft account to continue."
        action={<button type="button" className="button button-primary" onClick={signIn}>Sign in with Microsoft</button>}
      />
    )
  }
  if (error) {
    return (
      <AuthenticationState
        title="Access unavailable"
        message={error}
        action={<div className="authentication-actions"><button type="button" className="button button-primary" onClick={() => { setError(''); setRetryKey((value) => value + 1) }}>Try Again</button><button type="button" className="button button-secondary" onClick={signOut}>Sign Out</button></div>}
      />
    )
  }
  if (!user) return <AuthenticationState title="Loading account" message="Checking your Movement System access..." />
  return <AuthenticationContext.Provider value={context}>{children}</AuthenticationContext.Provider>
}

export function AuthenticationProvider({ children }: { children: ReactNode }) {
  if (browserAuthProvider === 'entra') return <EntraAuthenticationProvider>{children}</EntraAuthenticationProvider>
  return (
    <AuthenticationContext.Provider value={{ provider: 'development', user: null, signOut: async () => {} }}>
      {children}
    </AuthenticationContext.Provider>
  )
}

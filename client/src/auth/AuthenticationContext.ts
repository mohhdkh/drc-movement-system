import { createContext, useContext } from 'react'
import type { AuthenticatedUser } from '../types'

export interface AuthenticationContextValue {
  provider: 'development' | 'entra'
  user: AuthenticatedUser | null
  signOut: () => Promise<void>
}

export const AuthenticationContext = createContext<AuthenticationContextValue>({
  provider: 'development',
  user: null,
  signOut: async () => {},
})

export function useAuthentication() {
  return useContext(AuthenticationContext)
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MsalProvider } from '@azure/msal-react'
import './index.css'
import App from './App.tsx'
import { AuthenticationProvider } from './auth/AuthenticationProvider.tsx'
import { browserAuthProvider, validateBrowserAuthConfig } from './auth/config.ts'
import { createMsalInstance } from './auth/msal.ts'

const root = createRoot(document.getElementById('root')!)

async function bootstrap() {
  const errors = validateBrowserAuthConfig()
  if (errors.length) {
    root.render(<main className="authentication-page"><div className="authentication-panel"><h1>Configuration error</h1><p>Microsoft authentication is not configured for this deployment.</p></div></main>)
    return
  }

  const application = <AuthenticationProvider><App /></AuthenticationProvider>
  if (browserAuthProvider === 'entra') {
    const instance = createMsalInstance()
    await instance.initialize()
    root.render(<StrictMode><MsalProvider instance={instance}>{application}</MsalProvider></StrictMode>)
    return
  }
  root.render(<StrictMode>{application}</StrictMode>)
}

bootstrap().catch(() => {
  root.render(<main className="authentication-page"><div className="authentication-panel"><h1>Sign-in unavailable</h1><p>Microsoft authentication could not be initialized.</p></div></main>)
})

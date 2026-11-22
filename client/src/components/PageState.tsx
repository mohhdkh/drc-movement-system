import type { ReactNode } from 'react'

interface PageStateProps {
  title: string
  message?: string
  action?: ReactNode
}

export function LoadingState() {
  return (
    <div className="page-state" role="status">
      <span className="loading-indicator" aria-hidden="true" />
      <p>Loading...</p>
    </div>
  )
}

export function ErrorState({ title, message, action }: PageStateProps) {
  return (
    <div className="page-state page-state-error" role="alert">
      <h2>{title}</h2>
      {message && <p>{message}</p>}
      {action}
    </div>
  )
}

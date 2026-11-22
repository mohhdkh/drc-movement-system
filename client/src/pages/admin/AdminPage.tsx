import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminSectionNav } from '../../components/admin/AdminSectionNav'
import { ErrorState, LoadingState } from '../../components/PageState'
import { fetchAdminSummary } from '../../services/api'
import type { AdminSummary } from '../../types'

const dashboardItems: Array<{
  key?: keyof AdminSummary
  label: string
  path: string
  detail: string
}> = [
  { key: 'activeUsers', label: 'Active Users', path: '/admin/users', detail: 'Manage access and roles' },
  { key: 'vehicles', label: 'Vehicles', path: '/admin/vehicles', detail: 'Fleet availability' },
  { key: 'drivers', label: 'Drivers', path: '/admin/drivers', detail: 'Driver directory' },
  { key: 'gpsDevices', label: 'GPS Devices', path: '/admin/gps-devices', detail: 'Safety equipment' },
  { key: 'departments', label: 'Departments', path: '/admin/departments', detail: 'Organization structure' },
  { key: 'locations', label: 'Locations', path: '/admin/locations', detail: 'Movement reference data' },
  { label: 'System Settings', path: '/admin/settings', detail: 'Timezone and cutoff' },
  { label: 'Admin Audit Log', path: '/admin/audit-log', detail: 'Review recorded changes' },
]

export function AdminPage() {
  const [summary, setSummary] = useState<AdminSummary | null>(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isCurrent = true
    fetchAdminSummary()
      .then((data) => {
        if (isCurrent) setSummary(data)
      })
      .catch((loadError: unknown) => {
        if (isCurrent) setError(loadError instanceof Error ? loadError.message : 'Unable to load Admin summary.')
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false)
      })
    return () => {
      isCurrent = false
    }
  }, [])

  return (
    <div className="employee-page admin-page">
      <div className="page-heading"><div><p className="page-eyebrow">Admin workspace</p><h2>System Administration</h2></div></div>
      <AdminSectionNav />
      {isLoading ? <LoadingState /> : error || !summary ? (
        <ErrorState title="Admin dashboard could not be loaded" message={error} />
      ) : (
        <section className="admin-dashboard-grid" aria-label="Admin management areas">
          {dashboardItems.map((item) => (
            <Link className="admin-dashboard-item" to={item.path} key={item.path}>
              <span>{item.label}</span>
              {item.key && <strong>{summary[item.key]}</strong>}
              <small>{item.detail}</small>
            </Link>
          ))}
        </section>
      )}
    </div>
  )
}

import { NavLink } from 'react-router-dom'

const sections = [
  { path: '/admin', label: 'Overview', end: true },
  { path: '/admin/users', label: 'Users' },
  { path: '/admin/vehicles', label: 'Vehicles' },
  { path: '/admin/drivers', label: 'Drivers' },
  { path: '/admin/gps-devices', label: 'GPS Devices' },
  { path: '/admin/departments', label: 'Departments' },
  { path: '/admin/locations', label: 'Locations' },
  { path: '/admin/settings', label: 'Settings' },
  { path: '/admin/audit-log', label: 'Audit Log' },
]

export function AdminSectionNav() {
  return (
    <nav className="admin-tabs" aria-label="Admin sections">
      {sections.map((section) => (
        <NavLink key={section.path} to={section.path} end={section.end}>
          {section.label}
        </NavLink>
      ))}
    </nav>
  )
}

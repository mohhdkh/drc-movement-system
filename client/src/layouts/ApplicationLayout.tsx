import { useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { navigationItems } from '../data/navigation'
import { useAuthentication } from '../auth/AuthenticationContext'

export function ApplicationLayout() {
  const { pathname } = useLocation()
  const authentication = useAuthentication()
  const adminPageTitles: Record<string, string> = {
    '/admin/users': 'User Management',
    '/admin/vehicles': 'Vehicle Management',
    '/admin/drivers': 'Driver Management',
    '/admin/gps-devices': 'GPS Device Management',
    '/admin/departments': 'Department Management',
    '/admin/locations': 'Location Management',
    '/admin/settings': 'System Settings',
    '/admin/audit-log': 'Admin Audit Log',
  }
  const currentPage = pathname === '/employee/movements/new'
    ? 'New Movement Request'
    : pathname.startsWith('/area-manager/movements/')
      ? 'Area Manager Review'
      : pathname.startsWith('/supply-chain/movements/')
        ? 'Supply Chain Assignment'
        : pathname.startsWith('/safety/movements/')
          ? 'Safety Movement Review'
          : pathname.startsWith('/employee/movements/')
            ? 'Movement Details'
            : adminPageTitles[pathname]
              ?? navigationItems.find((item) => item.path === pathname)?.label
              ?? 'Employee'
  const isSafetyWorkspace = pathname.startsWith('/safety')
  const isSupplyChainWorkspace = pathname.startsWith('/supply-chain')
  const isAreaManagerWorkspace = pathname.startsWith('/area-manager')
  const isAdminWorkspace = pathname.startsWith('/admin')
  const developmentUser = isAdminWorkspace
    ? { initials: 'DS', name: 'Demo Safety Officer' }
    : isAreaManagerWorkspace
    ? { initials: 'DA', name: 'Demo Area Manager' }
    : isSupplyChainWorkspace
      ? { initials: 'DS', name: 'Demo Supply Chain Officer' }
      : isSafetyWorkspace
        ? { initials: 'DS', name: 'Demo Safety Officer' }
        : { initials: 'DE', name: 'Demo Employee' }
  const currentUser = authentication.user
    ? {
        initials: authentication.user.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase(),
        name: authentication.user.name,
      }
    : developmentUser
  const visibleNavigation = authentication.user
    ? navigationItems.filter((item) => authentication.user?.roles.includes(item.requiredRole))
    : navigationItems

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">DRC</span>
          <span className="brand-copy">
            <span className="brand-name">Movement System</span>
            <span className="brand-subtitle">Internal operations</span>
          </span>
        </div>

        <nav className="primary-nav" aria-label="Role workspaces">
          <p className="nav-section-label">Workspaces</p>
          {visibleNavigation.map((item) => (
            <NavLink key={item.path} to={item.path} className="nav-link">
              <span className="nav-index" aria-hidden="true">{item.shortLabel}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">DRC internal system</div>
      </aside>

      <div className="app-frame">
        <header className="app-header">
          <div>
            <p className="header-context">Current workspace</p>
            <h1 className="header-title">{currentPage}</h1>
          </div>

          <div className="user-summary" aria-label="Current user">
            <span className="user-avatar" aria-hidden="true">{currentUser.initials}</span>
            <span className="user-copy">
              <span className="user-name">{currentUser.name}</span>
              <span className="user-mode">{authentication.provider === 'entra' ? 'Microsoft account' : 'Local mode'}</span>
            </span>
            {authentication.provider === 'entra' && (
              <button type="button" className="user-signout" onClick={authentication.signOut}>Sign Out</button>
            )}
          </div>
        </header>

        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

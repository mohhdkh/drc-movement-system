import type { UserRole } from '../types'

export interface NavigationItem {
  label: string
  path: string
  shortLabel: string
  requiredRole: UserRole
}

export const navigationItems: NavigationItem[] = [
  { label: 'Employee', path: '/employee', shortLabel: 'EM', requiredRole: 'EMPLOYEE' },
  { label: 'Safety', path: '/safety', shortLabel: 'SF', requiredRole: 'SAFETY' },
  { label: 'Supply Chain', path: '/supply-chain', shortLabel: 'SC', requiredRole: 'SUPPLY_CHAIN' },
  { label: 'Area Manager', path: '/area-manager', shortLabel: 'AM', requiredRole: 'AREA_MANAGER' },
  { label: 'Admin', path: '/admin', shortLabel: 'AD', requiredRole: 'ADMIN' },
]

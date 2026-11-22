import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ApplicationLayout } from '../layouts/ApplicationLayout'
import { AdminResourcePage } from '../components/admin/AdminResourcePage'
import { LoadingState } from '../components/PageState'
import { useAuthentication } from '../auth/AuthenticationContext'
import type { UserRole } from '../types'

const AdminPage = lazy(() => import('../pages/admin/AdminPage').then((module) => ({ default: module.AdminPage })))
const AdminAuditLogPage = lazy(() => import('../pages/admin/AdminAuditLogPage').then((module) => ({ default: module.AdminAuditLogPage })))
const AdminSettingsPage = lazy(() => import('../pages/admin/AdminSettingsPage').then((module) => ({ default: module.AdminSettingsPage })))
const AdminUsersPage = lazy(() => import('../pages/admin/AdminUsersPage').then((module) => ({ default: module.AdminUsersPage })))
const AreaManagerMovementPage = lazy(() => import('../pages/area-manager/AreaManagerMovementPage').then((module) => ({ default: module.AreaManagerMovementPage })))
const AreaManagerPage = lazy(() => import('../pages/area-manager/AreaManagerPage').then((module) => ({ default: module.AreaManagerPage })))
const EmployeeDashboardPage = lazy(() => import('../pages/employee/EmployeeDashboardPage').then((module) => ({ default: module.EmployeeDashboardPage })))
const MovementDetailsPage = lazy(() => import('../pages/employee/MovementDetailsPage').then((module) => ({ default: module.MovementDetailsPage })))
const NewMovementPage = lazy(() => import('../pages/employee/NewMovementPage').then((module) => ({ default: module.NewMovementPage })))
const SafetyDashboardPage = lazy(() => import('../pages/safety/SafetyDashboardPage').then((module) => ({ default: module.SafetyDashboardPage })))
const SafetyMovementReviewPage = lazy(() => import('../pages/safety/SafetyMovementReviewPage').then((module) => ({ default: module.SafetyMovementReviewPage })))
const SupplyChainDashboardPage = lazy(() => import('../pages/supply-chain/SupplyChainDashboardPage').then((module) => ({ default: module.SupplyChainDashboardPage })))
const SupplyChainMovementPage = lazy(() => import('../pages/supply-chain/SupplyChainMovementPage').then((module) => ({ default: module.SupplyChainMovementPage })))

function RequireRole({ role, children }: { role: UserRole; children: ReactNode }) {
  const { user } = useAuthentication()
  if (user && !user.roles.includes(role)) return <Navigate to="/" replace />
  return children
}

function DefaultWorkspace() {
  const { user } = useAuthentication()
  const destination = user?.roles.includes('EMPLOYEE') ? '/employee'
    : user?.roles.includes('SAFETY') ? '/safety'
      : user?.roles.includes('SUPPLY_CHAIN') ? '/supply-chain'
        : user?.roles.includes('AREA_MANAGER') ? '/area-manager'
          : user?.roles.includes('ADMIN') ? '/admin'
            : '/employee'
  return <Navigate to={destination} replace />
}

export function AppRoutes() {
  return (
    <Suspense fallback={<LoadingState />}>
      <Routes>
        <Route element={<ApplicationLayout />}>
        <Route index element={<DefaultWorkspace />} />
        <Route path="employee" element={<RequireRole role="EMPLOYEE"><EmployeeDashboardPage /></RequireRole>} />
        <Route path="employee/movements/new" element={<RequireRole role="EMPLOYEE"><NewMovementPage /></RequireRole>} />
        <Route path="employee/movements/:id/edit" element={<RequireRole role="EMPLOYEE"><NewMovementPage /></RequireRole>} />
        <Route path="employee/movements/:id" element={<RequireRole role="EMPLOYEE"><MovementDetailsPage /></RequireRole>} />
        <Route path="safety" element={<RequireRole role="SAFETY"><SafetyDashboardPage /></RequireRole>} />
        <Route path="safety/movements/:id" element={<RequireRole role="SAFETY"><SafetyMovementReviewPage /></RequireRole>} />
        <Route path="supply-chain" element={<RequireRole role="SUPPLY_CHAIN"><SupplyChainDashboardPage /></RequireRole>} />
        <Route path="supply-chain/movements/:id" element={<RequireRole role="SUPPLY_CHAIN"><SupplyChainMovementPage /></RequireRole>} />
        <Route path="area-manager" element={<RequireRole role="AREA_MANAGER"><AreaManagerPage /></RequireRole>} />
        <Route path="area-manager/movements/:id" element={<RequireRole role="AREA_MANAGER"><AreaManagerMovementPage /></RequireRole>} />
        <Route path="admin" element={<RequireRole role="ADMIN"><AdminPage /></RequireRole>} />
        <Route path="admin/users" element={<RequireRole role="ADMIN"><AdminUsersPage /></RequireRole>} />
        <Route path="admin/vehicles" element={<RequireRole role="ADMIN"><AdminResourcePage resource="vehicles" title="Vehicle Management" itemLabel="Vehicle" fields={[{ name: 'code', label: 'Code', required: true }, { name: 'plateNumber', label: 'Plate Number', required: true }, { name: 'model', label: 'Model', required: true }]} /></RequireRole>} />
        <Route path="admin/drivers" element={<RequireRole role="ADMIN"><AdminResourcePage resource="drivers" title="Driver Management" itemLabel="Driver" fields={[{ name: 'name', label: 'Name', required: true }, { name: 'phone', label: 'Phone', type: 'tel' }]} /></RequireRole>} />
        <Route path="admin/gps-devices" element={<RequireRole role="ADMIN"><AdminResourcePage resource="gps-devices" title="GPS Device Management" itemLabel="GPS Device" fields={[{ name: 'code', label: 'Code', required: true }, { name: 'label', label: 'Label', required: true }]} /></RequireRole>} />
        <Route path="admin/departments" element={<RequireRole role="ADMIN"><AdminResourcePage resource="departments" title="Department Management" itemLabel="Department" fields={[{ name: 'name', label: 'Name', required: true }]} /></RequireRole>} />
        <Route path="admin/locations" element={<RequireRole role="ADMIN"><AdminResourcePage resource="locations" title="Location Management" itemLabel="Location" fields={[{ name: 'name', label: 'Name', required: true }, { name: 'latitude', label: 'Latitude', type: 'number' }, { name: 'longitude', label: 'Longitude', type: 'number' }]} /></RequireRole>} />
        <Route path="admin/settings" element={<RequireRole role="ADMIN"><AdminSettingsPage /></RequireRole>} />
        <Route path="admin/audit-log" element={<RequireRole role="ADMIN"><AdminAuditLogPage /></RequireRole>} />
        <Route path="*" element={<DefaultWorkspace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}

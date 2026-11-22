const INITIAL_TIMESTAMP = '2026-01-01T00:00:00.000Z'

const departments = [
  { id: 'dep-programs', name: 'Programs', active: true },
  { id: 'dep-safety', name: 'Safety', active: true },
  { id: 'dep-operations', name: 'Operations', active: true },
  { id: 'dep-support', name: 'Support Services', active: true },
  { id: 'dep-supply-chain', name: 'Supply Chain', active: true },
]

// Synthetic records only. Real personnel data must be provisioned through an approved private channel.
const users = [
  { id: 'emp-001', name: 'Demo Employee', email: 'employee@example.invalid', phone: null, departmentId: 'dep-programs', roles: ['EMPLOYEE'], active: true },
  { id: 'emp-002', name: 'Demo Safety Officer', email: 'safety@example.invalid', phone: null, departmentId: 'dep-safety', roles: ['EMPLOYEE', 'SAFETY', 'ADMIN'], active: true },
  { id: 'emp-003', name: 'Demo Passenger One', email: 'passenger.one@example.invalid', phone: null, departmentId: 'dep-programs', roles: ['EMPLOYEE'], active: true },
  { id: 'emp-004', name: 'Demo Area Manager', email: 'area.manager@example.invalid', phone: null, departmentId: 'dep-operations', roles: ['EMPLOYEE', 'AREA_MANAGER'], active: true },
  { id: 'emp-005', name: 'Demo Passenger Two', email: 'passenger.two@example.invalid', phone: null, departmentId: 'dep-support', roles: ['EMPLOYEE'], active: true },
  { id: 'emp-006', name: 'Demo Supply Chain Officer', email: 'supply.chain@example.invalid', phone: null, departmentId: 'dep-supply-chain', roles: ['EMPLOYEE', 'SUPPLY_CHAIN'], active: true },
  { id: 'emp-007', name: 'Demo Passenger Three', email: null, phone: null, departmentId: null, roles: ['EMPLOYEE'], active: true },
  { id: 'emp-008', name: 'Demo Passenger Four', email: null, phone: null, departmentId: null, roles: ['EMPLOYEE'], active: true },
]

const vehicles = [
  { id: 'veh-001', code: 'DEMO-001', plateNumber: 'DEMO-001', model: 'Demo 4x4', capacity: 8, active: true },
  { id: 'veh-002', code: 'DEMO-002', plateNumber: 'DEMO-002', model: 'Demo Pickup', capacity: 5, active: true },
  { id: 'veh-003', code: 'DEMO-003', plateNumber: 'DEMO-003', model: 'Demo Minibus', capacity: 12, active: true },
  { id: 'veh-004', code: 'DEMO-004', plateNumber: 'DEMO-004', model: 'Inactive demo vehicle', capacity: 8, active: false },
]

const drivers = [
  { id: 'drv-001', name: 'Demo Driver One', phone: null, active: true },
  { id: 'drv-002', name: 'Demo Driver Two', phone: null, active: true },
  { id: 'drv-003', name: 'Demo Driver Three', phone: null, active: true },
  { id: 'drv-004', name: 'Inactive Demo Driver', phone: null, active: false },
]

const gpsDevices = [
  { id: 'gps-001', code: 'GPS-01', label: 'Demo GPS 01', active: true },
  { id: 'gps-002', code: 'GPS-02', label: 'Demo GPS 02', active: true },
  { id: 'gps-003', code: 'GPS-03', label: 'Inactive Demo GPS', active: false },
]

const locations = [
  { id: 'loc-office-gaza', name: 'Demo Office', latitude: null, longitude: null, active: true },
  { id: 'loc-community-center', name: 'Demo Field Site', latitude: null, longitude: null, active: true },
]

function timestamped(items) {
  return items.map((item) => ({ ...item, createdAt: INITIAL_TIMESTAMP, updatedAt: INITIAL_TIMESTAMP }))
}

module.exports = {
  INITIAL_TIMESTAMP,
  departments: timestamped(departments),
  drivers: timestamped(drivers),
  gpsDevices: timestamped(gpsDevices),
  locations: timestamped(locations),
  users: timestamped(users).map((user) => ({
    ...user,
    entraObjectId: null,
    entraTenantId: null,
    entraPrincipalName: null,
  })),
  vehicles: timestamped(vehicles),
}

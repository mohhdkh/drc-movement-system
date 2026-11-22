export const USER_ROLES = [
  'EMPLOYEE',
  'SAFETY',
  'SUPPLY_CHAIN',
  'AREA_MANAGER',
  'ADMIN',
] as const

export type UserRole = (typeof USER_ROLES)[number]

export interface User {
  id: string
  name: string
  email: string | null
  phone: string | null
  departmentId: string | null
  entraLinked: boolean
  entraPrincipalName: string | null
  roles: UserRole[]
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface AuthenticatedUser {
  id: string
  name: string
  email: string | null
  phone: string | null
  departmentId: string | null
  department: string | null
  roles: UserRole[]
  active: boolean
  authenticationProvider: 'development' | 'entra'
}

export interface Employee {
  id: string
  displayName: string
  email: string | null
  role: 'EMPLOYEE'
  department?: string
  isActive: boolean
}

export const MOVEMENT_STATUSES = [
  'DRAFT',
  'PENDING_SAFETY',
  'RETURNED_FOR_MODIFICATION',
  'SAFETY_APPROVED',
  'SAFETY_REJECTED',
  'PENDING_VEHICLE_ASSIGNMENT',
  'VEHICLE_ASSIGNED',
  'PENDING_AREA_MANAGER',
  'FINAL_APPROVED',
  'FINAL_REJECTED',
  'CANCELLED',
] as const

export type MovementStatus = (typeof MOVEMENT_STATUSES)[number]

export interface Passenger {
  id: string
  userId?: string
  displayName: string
  department?: string
  phoneNumber?: string
}

export interface MovementSegment {
  id: string
  movementId: string
  sequence: number
  code: string
  fromLocation: string
  toLocation: string
  arrivalTime: string | null
  departureTime: string | null
  passengerIds: string[]
  fromLocationId?: string | null
  toLocationId?: string | null
  fromLatitude?: number | null
  fromLongitude?: number | null
  toLatitude?: number | null
  toLongitude?: number | null
}

export interface GPSDevice {
  id: string
  code: string
  label: string
  name?: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export type GPSAssignmentType = 'DEVICE' | 'NO_GPS' | null

export interface GPSAssignment {
  type: GPSAssignmentType
  gpsDeviceId: string | null
}

export type SafetyDecision = 'APPROVED' | 'REJECTED' | 'RETURNED' | null

export interface SafetyReview {
  reviewedBy: string | null
  reviewedAt: string | null
  decision: SafetyDecision
  comment: string | null
}

export type SafetyReviewAction = 'APPROVE' | 'REJECT' | 'RETURN'

export interface SafetyReviewPayload {
  action: SafetyReviewAction
  reviewedBy: string
  comment?: string
  gpsAssignment?: GPSAssignment
}

export interface Vehicle {
  id: string
  code: string
  plateNumber: string
  model: string
  capacity: number
  description?: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface Driver {
  id: string
  name: string
  phone: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface Department {
  id: string
  name: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface Location {
  id: string
  name: string
  latitude: number | null
  longitude: number | null
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface SystemSettings {
  movementTimezone: string
  movementCutoffHour: number
}

export interface AdminSummary {
  activeUsers: number
  vehicles: number
  drivers: number
  gpsDevices: number
  departments: number
  locations: number
}

export interface AdminAuditEntry {
  id: string
  timestamp: string
  actorId: string
  actorName: string
  action: string
  entityType: string
  entityId: string
  before: unknown
  after: unknown
}

export type AdminResource = Vehicle | Driver | GPSDevice | Department | Location
export type AdminResourceName = 'vehicles' | 'drivers' | 'gps-devices' | 'departments' | 'locations'

export interface SupplyChainAssignment {
  assignedBy: string | null
  assignedAt: string | null
  vehicleId: string | null
  driverId: string | null
  comment: string | null
}

export interface SupplyChainAssignmentPayload {
  assignedBy: string
  vehicleId: string
  driverId: string
  comment?: string
}

export type AreaManagerDecision = 'APPROVED' | 'REJECTED'

export interface AreaManagerApproval {
  decision: AreaManagerDecision | null
  reviewedBy: string | null
  reviewedAt: string | null
  comment: string | null
}

export interface AreaManagerReviewPayload {
  decision: AreaManagerDecision
  comment?: string
}

export interface Movement {
  id: string
  requesterId: string
  movementDate: string
  purpose: string
  etd: string
  eta: string
  startLocation: string
  startLocationId?: string | null
  routePointLocationIds?: string[]
  routePoints: string[]
  notes?: string
  vehicleLeaderId: string
  segments: MovementSegment[]
  status: MovementStatus
  safetyReview: SafetyReview
  gpsAssignment: GPSAssignment
  supplyChainAssignment: SupplyChainAssignment
  areaManagerApproval: AreaManagerApproval
  createdAt: string
  updatedAt: string
}

export interface CreateMovementSegmentInput {
  arrivalTime: string
  departureTime: string
  passengerIds: string[]
}

export interface CreateMovementInput {
  requesterId: string
  movementDate: string
  purpose: string
  startLocation: string
  startLocationId?: string
  startDepartureTime?: string
  routePoints: string[]
  routePointLocationIds?: string[]
  notes: string
  vehicleLeaderId: string
  segments: CreateMovementSegmentInput[]
}

export type UpdateMovementInput = Omit<CreateMovementInput, 'requesterId'>

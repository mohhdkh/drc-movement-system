import type {
  AreaManagerReviewPayload,
  AdminAuditEntry,
  AdminResource,
  AdminResourceName,
  AdminSummary,
  AuthenticatedUser,
  CreateMovementInput,
  Driver,
  Employee,
  GPSDevice,
  Movement,
  SafetyReviewPayload,
  SupplyChainAssignmentPayload,
  SystemSettings,
  User,
  UserRole,
  Vehicle,
  Location,
} from '../types'

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()
const API_BASE_URL = configuredApiBaseUrl ||
  (import.meta.env.DEV ? 'http://localhost:5000/api' : '/api')

interface ApiResponse<T> {
  data: T
}

export interface ApiValidationError {
  field: string
  message: string
}

interface ApiErrorResponse {
  code?: string
  message?: string
  errors?: ApiValidationError[]
}

export class ApiRequestError extends Error {
  validationErrors: ApiValidationError[]
  code?: string
  status?: number

  constructor(
    message: string,
    validationErrors: ApiValidationError[] = [],
    code?: string,
    status?: number,
  ) {
    super(message)
    this.name = 'ApiRequestError'
    this.validationErrors = validationErrors
    this.code = code
    this.status = status
  }
}

let accessTokenProvider: (() => Promise<string>) | undefined

export function configureAccessTokenProvider(provider?: () => Promise<string>) {
  accessTokenProvider = provider
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response
  try {
    const accessToken = accessTokenProvider ? await accessTokenProvider() : null
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...options?.headers,
      },
    })
  } catch (error) {
    if (error instanceof ApiRequestError) throw error
    throw new ApiRequestError('Unable to reach the movement service. Check your connection and try again.')
  }

  const contentType = response.headers.get('content-type') || ''
  let payload = {} as ApiResponse<T> & ApiErrorResponse
  if (contentType.includes('application/json')) {
    try {
      payload = await response.json() as ApiResponse<T> & ApiErrorResponse
    } catch {
      throw new ApiRequestError('The movement service returned an invalid response. Try again later.')
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new ApiRequestError(
        payload.message ?? 'Your session has expired. Sign in again.',
        payload.errors,
        payload.code,
        response.status,
      )
    }
    if (response.status === 403) {
      throw new ApiRequestError(
        payload.message ?? 'You do not have permission to perform this action.',
        payload.errors,
        payload.code,
        response.status,
      )
    }
    throw new ApiRequestError(
      payload.message ?? 'The request could not be completed.',
      payload.errors,
      payload.code,
      response.status,
    )
  }

  if (!contentType.includes('application/json')) {
    throw new ApiRequestError('The movement service returned an unexpected response. Try again later.')
  }

  return payload.data
}

export function fetchCurrentUser(): Promise<AuthenticatedUser> {
  return request<AuthenticatedUser>('/auth/me')
}

export function getEmployees(): Promise<Employee[]> {
  return request<Employee[]>('/employees')
}

export function getLocations(): Promise<Location[]> {
  return request<Location[]>('/locations')
}

export function getMovements(requesterId?: string): Promise<Movement[]> {
  const query = requesterId
    ? `?requesterId=${encodeURIComponent(requesterId)}`
    : ''
  return request<Movement[]>(`/movements${query}`)
}

export function getMovement(id: string): Promise<Movement> {
  return request<Movement>(`/movements/${encodeURIComponent(id)}`)
}

export function createMovement(input: CreateMovementInput): Promise<Movement> {
  return request<Movement>('/movements', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateMovement(
  id: string,
  input: Omit<CreateMovementInput, 'requesterId'>,
): Promise<Movement> {
  return request<Movement>(`/movements/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function fetchGpsDevices(): Promise<GPSDevice[]> {
  return request<GPSDevice[]>('/gps-devices')
}

export function fetchSafetyMovements(status?: string): Promise<Movement[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : ''
  return request<Movement[]>(`/safety/movements${query}`)
}

export function fetchSafetyMovement(id: string): Promise<Movement> {
  return request<Movement>(`/safety/movements/${encodeURIComponent(id)}`)
}

export function submitSafetyReview(
  id: string,
  payload: SafetyReviewPayload,
): Promise<Movement> {
  return request<Movement>(`/safety/movements/${encodeURIComponent(id)}/review`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function fetchVehicles(): Promise<Vehicle[]> {
  return request<Vehicle[]>('/vehicles')
}

export function fetchDrivers(): Promise<Driver[]> {
  return request<Driver[]>('/drivers')
}

export function fetchSupplyChainMovements(status?: string): Promise<Movement[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : ''
  return request<Movement[]>(`/supply-chain/movements${query}`)
}

export function fetchSupplyChainMovement(id: string): Promise<Movement> {
  return request<Movement>(`/supply-chain/movements/${encodeURIComponent(id)}`)
}

export function submitSupplyChainAssignment(
  id: string,
  payload: SupplyChainAssignmentPayload,
): Promise<Movement> {
  return request<Movement>(
    `/supply-chain/movements/${encodeURIComponent(id)}/assignment`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  )
}

export function fetchAreaManagerMovements(status?: string): Promise<Movement[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : ''
  return request<Movement[]>(`/area-manager/movements${query}`)
}

export function fetchAreaManagerMovement(id: string): Promise<Movement> {
  return request<Movement>(`/area-manager/movements/${encodeURIComponent(id)}`)
}

export function submitAreaManagerReview(
  id: string,
  payload: AreaManagerReviewPayload,
): Promise<Movement> {
  return request<Movement>(`/area-manager/movements/${encodeURIComponent(id)}/review`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function downloadMovementPlan(movementId?: string): Promise<{ blob: Blob; filename: string }> {
  const query = movementId ? `?movementId=${encodeURIComponent(movementId)}` : ''
  let response: Response
  try {
    const accessToken = accessTokenProvider ? await accessTokenProvider() : null
    response = await fetch(`${API_BASE_URL}/safety/movements/export.xlsx${query}`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    })
  } catch (error) {
    if (error instanceof ApiRequestError) throw error
    throw new ApiRequestError('Unable to reach the movement service. Check your connection and try again.')
  }
  if (!response.ok) {
    let payload: ApiErrorResponse = {}
    if ((response.headers.get('content-type') || '').includes('application/json')) {
      try { payload = await response.json() as ApiErrorResponse } catch { payload = {} }
    }
    throw new ApiRequestError(
      payload.message ?? 'The Movement Plan could not be generated.',
      payload.errors,
      payload.code,
      response.status,
    )
  }
  const disposition = response.headers.get('content-disposition') || ''
  const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || 'DRC_Movement_Tracker.xlsm'
  return { blob: await response.blob(), filename }
}

export interface WhatsAppBatchPreview {
  date: string
  movementIds: string[]
  movementCount: number
  text: string
}

export function fetchFinalApprovedSafetyMovements(date: string): Promise<Movement[]> {
  return request<Movement[]>(
    `/safety/movements/final-approved?date=${encodeURIComponent(date)}`,
  )
}

export function fetchWhatsAppBatchPreview(
  date: string,
  movementIds: string[],
): Promise<WhatsAppBatchPreview> {
  return request<WhatsAppBatchPreview>('/safety/movements/whatsapp-preview', {
    method: 'POST',
    body: JSON.stringify({ date, movementIds }),
  })
}

export function fetchAdminSummary(): Promise<AdminSummary> {
  return request<AdminSummary>('/admin/summary')
}

export function fetchAdminUsers(): Promise<User[]> {
  return request<User[]>('/admin/users')
}

export function fetchAdminUser(id: string): Promise<User> {
  return request<User>(`/admin/users/${encodeURIComponent(id)}`)
}

export type AdminUserInput = Omit<
  User,
  'createdAt' | 'updatedAt' | 'entraLinked' | 'entraPrincipalName'
>

export function createAdminUser(input: AdminUserInput): Promise<User> {
  return request<User>('/admin/users', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateAdminUser(
  id: string,
  input: Pick<User, 'name' | 'email' | 'phone' | 'departmentId'>,
): Promise<User> {
  return request<User>(`/admin/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function updateAdminUserStatus(id: string, active: boolean): Promise<User> {
  return request<User>(`/admin/users/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ active }),
  })
}

export function updateAdminUserRoles(id: string, roles: UserRole[]): Promise<User> {
  return request<User>(`/admin/users/${encodeURIComponent(id)}/roles`, {
    method: 'PATCH',
    body: JSON.stringify({ roles }),
  })
}

export function fetchAdminResources<T extends AdminResource>(
  resource: AdminResourceName,
): Promise<T[]> {
  return request<T[]>(`/admin/${resource}`)
}

export function createAdminResource<T extends AdminResource>(
  resource: AdminResourceName,
  input: Record<string, unknown>,
): Promise<T> {
  return request<T>(`/admin/${resource}`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateAdminResource<T extends AdminResource>(
  resource: AdminResourceName,
  id: string,
  input: Record<string, unknown>,
): Promise<T> {
  return request<T>(`/admin/${resource}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function updateAdminResourceStatus<T extends AdminResource>(
  resource: AdminResourceName,
  id: string,
  active: boolean,
): Promise<T> {
  return request<T>(`/admin/${resource}/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ active }),
  })
}

export function fetchAdminSettings(): Promise<SystemSettings> {
  return request<SystemSettings>('/admin/settings')
}

export function updateAdminSettings(input: SystemSettings): Promise<SystemSettings> {
  return request<SystemSettings>('/admin/settings', {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function fetchAdminAuditLog(filters: {
  entityType?: string
  action?: string
} = {}): Promise<AdminAuditEntry[]> {
  const params = new URLSearchParams()
  if (filters.entityType) params.set('entityType', filters.entityType)
  if (filters.action) params.set('action', filters.action)
  const query = params.size ? `?${params.toString()}` : ''
  return request<AdminAuditEntry[]>(`/admin/audit-log${query}`)
}

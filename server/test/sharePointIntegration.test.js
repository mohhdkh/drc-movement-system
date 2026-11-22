const assert = require('node:assert/strict')
const { test } = require('node:test')
const { GraphClient } = require('../src/integrations/microsoftGraph/graphClient')
const { GraphTokenClient } = require('../src/integrations/microsoftGraph/graphTokenClient')
const { createPersistenceProviders } = require('../src/integrations/sharepoint/persistenceProvider')
const { getSharePointConfig, validateSharePointConfig } = require('../src/integrations/sharepoint/sharePointConfig')
const { mapMasterData, mapMovement } = require('../src/integrations/sharepoint/sharePointMapper')
const { SharePointRepository } = require('../src/integrations/sharepoint/sharePointRepository')
const { SHAREPOINT_LISTS } = require('../src/integrations/sharepoint/sharePointSchema')
const { SQLiteSnapshotProvider } = require('../src/integrations/sharepoint/sqliteSnapshotProvider')

function movementFixture() {
  return {
    id: 'MOV-PHASE8', requesterId: 'emp-001', movementDate: '2099-12-31', purpose: 'Integration mapping',
    etd: '08:00', eta: '14:00', startLocation: 'Office', routePoints: ['A', 'B'],
    vehicleLeaderId: 'emp-001', notes: 'Mapped', status: 'FINAL_APPROVED',
    createdAt: '2099-01-01T00:00:00.000Z', updatedAt: '2099-01-01T04:00:00.000Z',
    segments: [
      { id: 'MOV-PHASE8-M01', code: 'M01', fromLocation: 'Office', toLocation: 'A', arrivalTime: '09:00', departureTime: '09:30', passengerIds: ['emp-001', 'emp-002'] },
      { id: 'MOV-PHASE8-M02', code: 'M02', fromLocation: 'A', toLocation: 'B', arrivalTime: '12:00', departureTime: '12:30', passengerIds: ['emp-001'] },
      { id: 'MOV-PHASE8-M03', code: 'M03', fromLocation: 'B', toLocation: 'Office', arrivalTime: '13:45', departureTime: '14:00', passengerIds: ['emp-001', 'emp-003'] },
    ],
    safetyReview: { decision: 'APPROVED', reviewedBy: 'emp-002', reviewedAt: '2099-01-01T01:00:00.000Z', comment: 'Safe' },
    gpsAssignment: { type: 'DEVICE', gpsDeviceId: 'gps-001' },
    supplyChainAssignment: { assignedBy: 'emp-006', assignedAt: '2099-01-01T02:00:00.000Z', vehicleId: 'veh-001', driverId: 'drv-001', comment: 'Assigned' },
    areaManagerApproval: { decision: 'APPROVED', reviewedBy: 'emp-004', reviewedAt: '2099-01-01T03:00:00.000Z', comment: 'Final' },
  }
}

function enabledConfig(overrides = {}) {
  return {
    enabled: true, tenantId: 'tenant', clientId: 'client', clientSecret: 'secret',
    hostname: 'drc.sharepoint.com', sitePath: 'sites/movements', siteId: '', driveId: '',
    ...overrides,
  }
}

test('SharePoint disabled selects SQLite and validates no Microsoft credentials', () => {
  const config = getSharePointConfig({ MS_SHAREPOINT_ENV_ENABLED: 'false' })
  const providers = createPersistenceProviders({ config })
  assert.equal(providers.active.kind, 'sqlite')
  assert.deepEqual(validateSharePointConfig(config), [])
  assert.ok(providers.sqlite.dryRunSummary().users >= 6)
})

test('Graph token client caches a token while it remains valid', async () => {
  let calls = 0
  const client = new GraphTokenClient({
    tenantId: 'tenant', clientId: 'client', clientSecret: 'secret', now: () => 1000,
    transport: { post: async () => { calls += 1; return { data: { access_token: 'token-one', expires_in: 3600 } } } },
  })
  assert.equal(await client.getAccessToken(), 'token-one')
  assert.equal(await client.getAccessToken(), 'token-one')
  assert.equal(calls, 1)
})

test('Graph token client refreshes after the cached token expiry window', async () => {
  let now = 0
  let calls = 0
  const client = new GraphTokenClient({
    tenantId: 'tenant', clientId: 'client', clientSecret: 'secret', now: () => now,
    transport: { post: async () => ({ data: { access_token: `token-${++calls}`, expires_in: 120 } }) },
  })
  assert.equal(await client.getAccessToken(), 'token-1')
  now = 61000
  assert.equal(await client.getAccessToken(), 'token-2')
})

test('resolves a SharePoint site by configured ID or hostname and path', async () => {
  const paths = []
  const graphClient = { request: async ({ path }) => { paths.push(path); return { id: `site-${paths.length}`, displayName: 'Movements' } } }
  const byId = new SharePointRepository({ graphClient, config: enabledConfig({ siteId: 'known-site' }) })
  const byPath = new SharePointRepository({ graphClient, config: enabledConfig() })
  assert.equal((await byId.resolveSite()).id, 'site-1')
  assert.equal((await byPath.resolveSite()).id, 'site-2')
  assert.deepEqual(paths, ['/sites/known-site', '/sites/drc.sharepoint.com:/sites/movements'])
})

test('rejects incomplete enabled configuration before any Graph request', async () => {
  let called = false
  const repository = new SharePointRepository({
    graphClient: { request: async () => { called = true } },
    config: getSharePointConfig({ MS_SHAREPOINT_ENV_ENABLED: 'true' }),
  })
  await assert.rejects(repository.resolveSite(), { code: 'SHAREPOINT_CONFIG_INVALID' })
  assert.equal(called, false)
})

test('resolves required lists and reports missing list columns', async () => {
  const movementList = { id: 'list-1', displayName: 'MovementRequests' }
  const graphClient = {
    request: async () => ({ id: 'site', displayName: 'Movement Site' }),
    getAll: async (path) => path.includes('/columns')
      ? [{ name: 'MovementId' }]
      : [movementList],
  }
  const repository = new SharePointRepository({
    graphClient, config: enabledConfig(),
    schema: { movementRequests: SHAREPOINT_LISTS.movementRequests },
  })
  assert.equal((await repository.getList('movementRequests')).id, 'list-1')
  const report = await repository.verifySchema()
  assert.equal(report.requiredListsPresent, false)
  assert.ok(report.missingColumns.MovementRequests.includes('Purpose'))
})

test('provisioning creates only missing schema and is idempotent on repeat', async () => {
  const lists = []
  let listCreates = 0
  const graphClient = {
    request: async ({ method = 'GET', path, data }) => {
      if (method === 'GET' && path.startsWith('/sites/')) return { id: 'site', displayName: 'Movement Site' }
      if (method === 'POST' && path.endsWith('/lists')) {
        listCreates += 1
        const list = { id: 'list-1', displayName: data.displayName }
        lists.push(list)
        return list
      }
      throw new Error(`Unexpected ${method} ${path}`)
    },
    getAll: async (path) => path.includes('/columns') ? [{ name: 'VehicleId' }] : [...lists],
  }
  const repository = new SharePointRepository({
    graphClient, config: enabledConfig(),
    schema: { vehicles: { ...SHAREPOINT_LISTS.vehicles, columns: [SHAREPOINT_LISTS.vehicles.columns[0]] } },
  })
  assert.deepEqual((await repository.provision()).createdLists, ['Vehicles'])
  assert.deepEqual((await repository.provision()).createdLists, [])
  assert.equal(listCreates, 1)
})

test('Graph pagination follows every @odata.nextLink', async () => {
  const requested = []
  const client = new GraphClient({
    tokenClient: { getAccessToken: async () => 'token', invalidate() {} },
    transport: { request: async ({ url }) => {
      requested.push(url)
      return requested.length === 1
        ? { data: { value: [{ id: 1 }], '@odata.nextLink': 'https://graph.microsoft.com/page-2' } }
        : { data: { value: [{ id: 2 }] } }
    } },
  })
  assert.deepEqual(await client.getAll('/sites/site/lists'), [{ id: 1 }, { id: 2 }])
  assert.equal(requested[1], 'https://graph.microsoft.com/page-2')
})

test('a Graph 401 invalidates the token once and retries with a fresh token', async () => {
  let requests = 0
  let invalidations = 0
  const client = new GraphClient({
    tokenClient: { getAccessToken: async () => `token-${requests + 1}`, invalidate: () => { invalidations += 1 } },
    transport: { request: async () => {
      requests += 1
      if (requests === 1) throw { response: { status: 401, data: { error: { code: 'InvalidAuthenticationToken' } } } }
      return { data: { id: 'site' } }
    } },
  })
  assert.deepEqual(await client.request({ path: '/site' }), { id: 'site' })
  assert.equal(invalidations, 1)
  assert.equal(requests, 2)
})

test('maps movement parent, dynamic segments, and per-segment passengers', () => {
  const mapped = mapMovement(movementFixture(), [])
  assert.equal(mapped.movementRequests[0].MovementId, 'MOV-PHASE8')
  assert.deepEqual(mapped.movementSegments.map((item) => item.SegmentCode), ['M01', 'M02', 'M03'])
  assert.equal(mapped.movementSegments[1].ArrivalTime, '12:00')
  assert.equal(mapped.movementSegmentPassengers.length, 5)
  assert.ok(mapped.movementSegmentPassengers.every((item) => item.MovementId === 'MOV-PHASE8'))
})

test('maps Safety, Supply Chain, Area Manager, and status history records', () => {
  const mapped = mapMovement(movementFixture(), [{
    id: 4, fromStatus: 'VEHICLE_ASSIGNED', status: 'FINAL_APPROVED', actorId: 'emp-004',
    changedAt: '2099-01-01T03:00:00.000Z', context: 'Approved',
  }])
  assert.equal(mapped.safetyReviews[0].GPSDeviceId, 'gps-001')
  assert.equal(mapped.supplyChainAssignments[0].VehicleId, 'veh-001')
  assert.equal(mapped.areaManagerApprovals[0].ReviewedBy, 'emp-004')
  assert.deepEqual(
    [mapped.movementStatusHistory[0].FromStatus, mapped.movementStatusHistory[0].ToStatus],
    ['VEHICLE_ASSIGNED', 'FINAL_APPROVED'],
  )
  const noGpsMovement = movementFixture()
  noGpsMovement.gpsAssignment = { type: 'NO_GPS', gpsDeviceId: null }
  assert.equal(mapMovement(noGpsMovement).safetyReviews[0].ExplicitNoGPS, true)
})

test('maps multiple user roles deterministically and preserves inactive master data', () => {
  const mapped = mapMasterData({
    users: [{ id: 'emp-x', name: 'User', email: null, phone: null, departmentId: null, roles: ['EMPLOYEE', 'ADMIN'], active: false, createdAt: 'a', updatedAt: 'b' }],
    departments: [], drivers: [], gpsDevices: [], locations: [],
    auditLogs: [{ id: 'AUD-1', timestamp: 'b', actorId: 'emp-002', actorName: 'Admin', action: 'UPDATED', entityType: 'USER', entityId: 'emp-x', before: { active: true }, after: { active: false } }],
    settings: { movementTimezone: 'UTC', movementCutoffHour: 12, updatedAt: 'b' },
    vehicles: [{ id: 'veh-x', code: 'X', plateNumber: 'X', model: 'X', active: false, createdAt: 'a', updatedAt: 'b' }],
  })
  assert.equal(mapped.users[0].RolesJson, '["EMPLOYEE","ADMIN"]')
  assert.equal(mapped.users[0].Active, false)
  assert.equal(mapped.vehicles[0].Active, false)
  assert.equal(mapped.systemSettings[0].MovementTimezone, 'UTC')
  assert.equal(mapped.adminAuditLog[0].ActorId, 'emp-002')
  assert.equal(mapped.adminAuditLog[0].AfterJson, '{"active":false}')
})

test('stable-key upsert creates once and updates on idempotent retry', async () => {
  const items = []
  const calls = []
  const repository = new SharePointRepository({ graphClient: {
    request: async ({ method, path, data }) => {
      calls.push(method)
      if (method === 'POST') {
        const item = { id: 'sp-1', fields: data.fields }
        items.push(item)
        return item
      }
      if (method === 'PATCH') {
        items[0].fields = data
        return data
      }
      throw new Error(path)
    },
  }, config: enabledConfig(), schema: { vehicles: SHAREPOINT_LISTS.vehicles } })
  repository.resolveSite = async () => ({ id: 'site' })
  repository.getList = async () => ({ id: 'list' })
  repository.readItems = async () => items
  const record = { Title: 'veh-1', VehicleId: 'veh-1', VehicleCode: 'A' }
  assert.equal((await repository.upsert('vehicles', record)).action, 'created')
  assert.equal((await repository.upsert('vehicles', { ...record, VehicleCode: 'B' })).action, 'updated')
  assert.deepEqual(calls, ['POST', 'PATCH'])
  assert.equal(items.length, 1)
})

test('duplicate domain IDs are rejected rather than silently multiplied', async () => {
  const repository = new SharePointRepository({ graphClient: {}, config: enabledConfig(), schema: { vehicles: SHAREPOINT_LISTS.vehicles } })
  repository.resolveSite = async () => ({ id: 'site' })
  repository.getList = async () => ({ id: 'list' })
  repository.readItems = async () => [
    { id: '1', fields: { VehicleId: 'veh-1' } },
    { id: '2', fields: { VehicleId: 'veh-1' } },
  ]
  await assert.rejects(repository.upsert('vehicles', { VehicleId: 'veh-1' }), { code: 'SHAREPOINT_DUPLICATE_DOMAIN_ID' })
})

test('a newer SharePoint record is never overwritten by a stale SQLite mirror', async () => {
  const repository = new SharePointRepository({ graphClient: {}, config: enabledConfig(), schema: { vehicles: SHAREPOINT_LISTS.vehicles } })
  repository.resolveSite = async () => ({ id: 'site' })
  repository.getList = async () => ({ id: 'list' })
  repository.readItems = async () => [{
    id: '1', fields: { VehicleId: 'veh-1', UpdatedAt: '2099-01-02T00:00:00.000Z' },
  }]
  await assert.rejects(repository.upsert('vehicles', {
    VehicleId: 'veh-1', UpdatedAt: '2099-01-01T00:00:00.000Z',
  }), { code: 'SHAREPOINT_REMOTE_NEWER' })
})

test('429 responses respect Retry-After and retry successfully', async () => {
  let calls = 0
  const waits = []
  const client = new GraphClient({
    tokenClient: { getAccessToken: async () => 'token', invalidate() {} },
    sleep: async (milliseconds) => waits.push(milliseconds),
    transport: { request: async () => {
      calls += 1
      if (calls === 1) throw { response: { status: 429, headers: { 'retry-after': '2' }, data: { error: { code: 'TooManyRequests' } } } }
      return { data: { value: [] } }
    } },
  })
  await client.request({ path: '/test' })
  assert.deepEqual(waits, [2000])
  assert.equal(calls, 2)
})

test('transient 5xx failures use bounded exponential retry', async () => {
  let calls = 0
  const waits = []
  const client = new GraphClient({
    tokenClient: { getAccessToken: async () => 'token', invalidate() {} },
    sleep: async (milliseconds) => waits.push(milliseconds),
    transport: { request: async () => {
      calls += 1
      if (calls < 3) throw { response: { status: 503, data: { error: { code: 'serviceNotAvailable' } } } }
      return { data: { ok: true } }
    } },
  })
  assert.deepEqual(await client.request({ path: '/test' }), { ok: true })
  assert.deepEqual(waits, [1000, 2000])
})

test('403 permission failures are surfaced without retries', async () => {
  let calls = 0
  const client = new GraphClient({
    tokenClient: { getAccessToken: async () => 'token', invalidate() {} },
    transport: { request: async () => { calls += 1; throw { response: { status: 403, data: { error: { code: 'accessDenied' } } } } } },
  })
  await assert.rejects(client.request({ path: '/test' }), (error) => {
    assert.equal(error.code, 'accessDenied')
    assert.match(error.message, /denied access/i)
    return true
  })
  assert.equal(calls, 1)
})

test('partial multi-list writes report completed operations and failed list', async () => {
  const repository = new SharePointRepository({ graphClient: {}, config: enabledConfig(), schema: {
    movementRequests: SHAREPOINT_LISTS.movementRequests,
    movementSegments: SHAREPOINT_LISTS.movementSegments,
  } })
  repository.upsert = async (listName) => {
    if (listName === 'movementSegments') throw new Error('failure')
    return { action: 'created', itemId: '1', domainId: 'MOV-1' }
  }
  await assert.rejects(
    repository.syncMappedRecords({ movementRequests: [{ MovementId: 'MOV-1' }], movementSegments: [{ SegmentId: 'SEG-1' }] }),
    (error) => {
      assert.equal(error.code, 'SHAREPOINT_PARTIAL_WRITE')
      assert.equal(error.details.completed.length, 1)
      assert.equal(error.details.failedList, 'movementSegments')
      return true
    },
  )
})

test('SQLite dry-run reports every normalized data category without writes', () => {
  const summary = new SQLiteSnapshotProvider().getDryRunSummary()
  assert.ok(summary.users >= 6)
  assert.ok(summary.departments >= 5)
  assert.ok(summary.vehicles >= 4)
  assert.equal(summary.settings, 1)
  assert.equal(typeof summary.movements, 'number')
  assert.equal(typeof summary.segments, 'number')
  assert.equal(typeof summary.passengers, 'number')
  assert.equal(typeof summary.statusHistory, 'number')
})

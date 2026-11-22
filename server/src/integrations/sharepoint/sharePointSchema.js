const ROLES = ['EMPLOYEE', 'SAFETY', 'SUPPLY_CHAIN', 'AREA_MANAGER', 'ADMIN']

const text = (name, options = {}) => ({ name, required: Boolean(options.required), text: { allowMultipleLines: Boolean(options.multiline) }, indexed: Boolean(options.indexed) })
const dateTime = (name, required = false) => ({ name, required, dateTime: { format: 'dateTime' } })
const boolean = (name) => ({ name, boolean: {} })
const number = (name) => ({ name, number: {} })

const SHAREPOINT_LISTS = {
  movementRequests: {
    displayName: 'MovementRequests', keyField: 'MovementId', columns: [
      text('MovementId', { required: true, indexed: true }), dateTime('MovementDate', true),
      text('Purpose', { required: true, multiline: true }), text('OverallETD', { required: true }),
      text('OverallETA', { required: true }), text('StartPoint', { required: true }),
      text('Notes', { multiline: true }), text('RequesterId', { required: true }),
      text('VehicleLeaderId', { required: true }), text('CurrentStatus', { required: true, indexed: true }),
      dateTime('CreatedAt', true), dateTime('UpdatedAt', true),
    ],
  },
  movementSegments: {
    displayName: 'MovementSegments', keyField: 'SegmentId', columns: [
      text('SegmentId', { required: true, indexed: true }), text('MovementId', { required: true, indexed: true }),
      text('SegmentCode', { required: true }), number('Sequence'), text('FromLocation', { required: true }),
      text('ToLocation', { required: true }), text('ArrivalTime'), text('DepartureTime'),
    ],
  },
  movementSegmentPassengers: {
    displayName: 'MovementSegmentPassengers', keyField: 'PassengerRecordId', columns: [
      text('PassengerRecordId', { required: true, indexed: true }), text('MovementId', { required: true, indexed: true }),
      text('SegmentId', { required: true, indexed: true }), text('PassengerId', { required: true }), number('Sequence'),
    ],
  },
  movementStatusHistory: {
    displayName: 'MovementStatusHistory', keyField: 'HistoryId', columns: [
      text('HistoryId', { required: true, indexed: true }), text('MovementId', { required: true, indexed: true }),
      text('FromStatus'), text('ToStatus', { required: true }), text('ActorId'), dateTime('Timestamp', true),
      text('Context', { multiline: true }),
    ],
  },
  users: {
    displayName: 'Users', keyField: 'UserId', columns: [
      text('UserId', { required: true, indexed: true }), text('DisplayName', { required: true }), text('Email'),
      text('Phone'), text('DepartmentId'), text('RolesJson', { required: true, multiline: true }), boolean('Active'),
      dateTime('CreatedAt', true), dateTime('UpdatedAt', true),
    ],
  },
  departments: {
    displayName: 'Departments', keyField: 'DepartmentId', columns: [
      text('DepartmentId', { required: true, indexed: true }), text('DepartmentName', { required: true }),
      boolean('Active'), dateTime('CreatedAt', true), dateTime('UpdatedAt', true),
    ],
  },
  vehicles: {
    displayName: 'Vehicles', keyField: 'VehicleId', columns: [
      text('VehicleId', { required: true, indexed: true }), text('VehicleCode', { required: true }),
      text('PlateNumber', { required: true }), text('Model', { required: true }), number('Capacity'), boolean('Active'),
      dateTime('CreatedAt', true), dateTime('UpdatedAt', true),
    ],
  },
  drivers: {
    displayName: 'Drivers', keyField: 'DriverId', columns: [
      text('DriverId', { required: true, indexed: true }), text('DriverName', { required: true }), text('Phone'),
      boolean('Active'), dateTime('CreatedAt', true), dateTime('UpdatedAt', true),
    ],
  },
  gpsDevices: {
    displayName: 'GPSDevices', keyField: 'GPSDeviceId', columns: [
      text('GPSDeviceId', { required: true, indexed: true }), text('GPSCode', { required: true }),
      text('GPSLabel', { required: true }), boolean('Active'), dateTime('CreatedAt', true), dateTime('UpdatedAt', true),
    ],
  },
  locations: {
    displayName: 'Locations', keyField: 'LocationId', columns: [
      text('LocationId', { required: true, indexed: true }), text('LocationName', { required: true }),
      number('Latitude'), number('Longitude'), boolean('Active'), dateTime('CreatedAt', true), dateTime('UpdatedAt', true),
    ],
  },
  adminAuditLog: {
    displayName: 'AdminAuditLog', keyField: 'AuditId', columns: [
      text('AuditId', { required: true, indexed: true }), dateTime('Timestamp', true),
      text('ActorId', { required: true }), text('ActorName', { required: true }), text('Action', { required: true }),
      text('EntityType', { required: true }), text('EntityId', { required: true }),
      text('BeforeJson', { multiline: true }), text('AfterJson', { multiline: true }),
    ],
  },
  systemSettings: {
    displayName: 'SystemSettings', keyField: 'SettingsId', columns: [
      text('SettingsId', { required: true, indexed: true }), text('MovementTimezone', { required: true }),
      number('MovementCutoffHour'), dateTime('UpdatedAt', true),
    ],
  },
  safetyReviews: {
    displayName: 'SafetyReviews', keyField: 'MovementId', columns: [
      text('MovementId', { required: true, indexed: true }), text('Decision'), text('ReviewedBy'),
      dateTime('ReviewedAt'), text('Comment', { multiline: true }), text('GPSDeviceId'), boolean('ExplicitNoGPS'),
    ],
  },
  supplyChainAssignments: {
    displayName: 'SupplyChainAssignments', keyField: 'MovementId', columns: [
      text('MovementId', { required: true, indexed: true }), text('AssignedBy'), dateTime('AssignedAt'),
      text('VehicleId'), text('DriverId'), text('Comment', { multiline: true }),
    ],
  },
  areaManagerApprovals: {
    displayName: 'AreaManagerApprovals', keyField: 'MovementId', columns: [
      text('MovementId', { required: true, indexed: true }), text('Decision'), text('ReviewedBy'),
      dateTime('ReviewedAt'), text('Comment', { multiline: true }),
    ],
  },
}

const SHAREPOINT_FIELDS = Object.fromEntries(
  Object.entries(SHAREPOINT_LISTS).map(([key, list]) => [key, Object.fromEntries(
    [list.keyField, ...list.columns.map((column) => column.name)].map((name) => [name, name]),
  )]),
)

module.exports = { ROLES, SHAREPOINT_FIELDS, SHAREPOINT_LISTS }

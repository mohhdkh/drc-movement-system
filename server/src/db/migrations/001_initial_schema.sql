CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT COLLATE NOCASE UNIQUE,
  phone TEXT,
  department_id TEXT,
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  PRIMARY KEY (user_id, role)
);

CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL COLLATE NOCASE UNIQUE,
  plate_number TEXT NOT NULL COLLATE NOCASE UNIQUE,
  model TEXT NOT NULL,
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS drivers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gps_devices (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL COLLATE NOCASE UNIQUE,
  label TEXT NOT NULL,
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  latitude REAL,
  longitude REAL,
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS system_settings (
  id TEXT PRIMARY KEY CHECK (id = 'system'),
  movement_timezone TEXT NOT NULL,
  movement_cutoff_hour INTEGER NOT NULL CHECK (movement_cutoff_hour BETWEEN 0 AND 23),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, action);

CREATE TABLE IF NOT EXISTS movements (
  id TEXT PRIMARY KEY,
  requester_id TEXT NOT NULL,
  movement_date TEXT NOT NULL,
  purpose TEXT NOT NULL,
  etd TEXT NOT NULL,
  eta TEXT NOT NULL,
  start_location TEXT NOT NULL,
  route_points_json TEXT NOT NULL,
  vehicle_leader_id TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS movement_segments (
  id TEXT PRIMARY KEY,
  movement_id TEXT NOT NULL REFERENCES movements(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL,
  code TEXT NOT NULL,
  from_location TEXT NOT NULL,
  to_location TEXT NOT NULL,
  arrival_time TEXT,
  departure_time TEXT,
  UNIQUE (movement_id, sequence_number)
);

CREATE TABLE IF NOT EXISTS movement_segment_passengers (
  segment_id TEXT NOT NULL REFERENCES movement_segments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (segment_id, user_id)
);

CREATE TABLE IF NOT EXISTS safety_reviews (
  movement_id TEXT PRIMARY KEY REFERENCES movements(id) ON DELETE CASCADE,
  reviewed_by TEXT,
  reviewed_at TEXT,
  decision TEXT,
  comment TEXT,
  gps_type TEXT,
  gps_device_id TEXT
);

CREATE TABLE IF NOT EXISTS supply_chain_assignments (
  movement_id TEXT PRIMARY KEY REFERENCES movements(id) ON DELETE CASCADE,
  assigned_by TEXT,
  assigned_at TEXT,
  vehicle_id TEXT,
  driver_id TEXT,
  comment TEXT
);

CREATE TABLE IF NOT EXISTS area_manager_approvals (
  movement_id TEXT PRIMARY KEY REFERENCES movements(id) ON DELETE CASCADE,
  decision TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  comment TEXT
);

CREATE TABLE IF NOT EXISTS movement_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  movement_id TEXT NOT NULL REFERENCES movements(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  changed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_movement_status ON movements(status);
CREATE INDEX IF NOT EXISTS idx_movement_history ON movement_status_history(movement_id, id);

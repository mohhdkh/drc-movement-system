CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS departments_name_ci_unique ON departments (LOWER(name));

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  department_id TEXT REFERENCES departments(id),
  active BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_ci_unique ON users (LOWER(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('EMPLOYEE', 'SAFETY', 'SUPPLY_CHAIN', 'AREA_MANAGER', 'ADMIN')),
  PRIMARY KEY (user_id, role)
);

CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  plate_number TEXT NOT NULL,
  model TEXT NOT NULL,
  active BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_code_ci_unique ON vehicles (LOWER(code));
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_plate_ci_unique ON vehicles (LOWER(plate_number));

CREATE TABLE IF NOT EXISTS drivers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  active BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS gps_devices (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  active BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS gps_devices_code_ci_unique ON gps_devices (LOWER(code));

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  latitude DOUBLE PRECISION CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION CHECK (longitude BETWEEN -180 AND 180),
  active BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS locations_name_ci_unique ON locations (LOWER(name));

CREATE TABLE IF NOT EXISTS system_settings (
  id TEXT PRIMARY KEY CHECK (id = 'system'),
  movement_timezone TEXT NOT NULL,
  movement_cutoff_hour SMALLINT NOT NULL CHECK (movement_cutoff_hour BETWEEN 0 AND 23),
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json JSONB,
  after_json JSONB
);
CREATE INDEX IF NOT EXISTS audit_logs_timestamp_idx ON audit_logs (timestamp DESC, id DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs (entity_type, action);

CREATE TABLE IF NOT EXISTS movements (
  id TEXT PRIMARY KEY,
  requester_id TEXT NOT NULL REFERENCES users(id),
  movement_date DATE NOT NULL,
  purpose TEXT NOT NULL,
  etd TIME NOT NULL,
  eta TIME NOT NULL,
  start_location TEXT NOT NULL,
  route_points JSONB NOT NULL,
  vehicle_leader_id TEXT NOT NULL REFERENCES users(id),
  notes TEXT,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS movements_status_idx ON movements (status);
CREATE INDEX IF NOT EXISTS movements_schedule_idx ON movements (movement_date, etd, eta);

CREATE TABLE IF NOT EXISTS movement_segments (
  id TEXT PRIMARY KEY,
  movement_id TEXT NOT NULL REFERENCES movements(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL,
  code TEXT NOT NULL,
  from_location TEXT NOT NULL,
  to_location TEXT NOT NULL,
  arrival_time TIME NOT NULL,
  departure_time TIME NOT NULL,
  UNIQUE (movement_id, sequence_number)
);

CREATE TABLE IF NOT EXISTS movement_segment_passengers (
  segment_id TEXT NOT NULL REFERENCES movement_segments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  position INTEGER NOT NULL,
  PRIMARY KEY (segment_id, user_id),
  UNIQUE (segment_id, position)
);

CREATE TABLE IF NOT EXISTS safety_reviews (
  movement_id TEXT PRIMARY KEY REFERENCES movements(id) ON DELETE CASCADE,
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  decision TEXT,
  comment TEXT,
  gps_type TEXT,
  gps_device_id TEXT REFERENCES gps_devices(id)
);

CREATE TABLE IF NOT EXISTS supply_chain_assignments (
  movement_id TEXT PRIMARY KEY REFERENCES movements(id) ON DELETE CASCADE,
  assigned_by TEXT REFERENCES users(id),
  assigned_at TIMESTAMPTZ,
  vehicle_id TEXT REFERENCES vehicles(id),
  driver_id TEXT REFERENCES drivers(id),
  comment TEXT
);

CREATE TABLE IF NOT EXISTS area_manager_approvals (
  movement_id TEXT PRIMARY KEY REFERENCES movements(id) ON DELETE CASCADE,
  decision TEXT,
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  comment TEXT
);

CREATE TABLE IF NOT EXISTS movement_status_history (
  id BIGSERIAL PRIMARY KEY,
  movement_id TEXT NOT NULL REFERENCES movements(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL,
  from_status TEXT,
  actor_id TEXT REFERENCES users(id),
  context TEXT
);
CREATE INDEX IF NOT EXISTS movement_status_history_movement_idx
  ON movement_status_history (movement_id, id);

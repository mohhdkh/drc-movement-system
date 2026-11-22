INSERT INTO departments (id, name, active, created_at, updated_at) VALUES
  ('dep-programs', 'Programs', TRUE, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('dep-safety', 'Safety', TRUE, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('dep-operations', 'Operations', TRUE, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('dep-support', 'Support Services', TRUE, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('dep-supply-chain', 'Supply Chain', TRUE, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, name, email, phone, department_id, active, created_at, updated_at) VALUES
  ('emp-001', 'Demo Employee', 'employee@example.invalid', NULL, 'dep-programs', TRUE, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('emp-002', 'Demo Safety Officer', 'safety@example.invalid', NULL, 'dep-safety', TRUE, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('emp-003', 'Demo Passenger One', 'passenger.one@example.invalid', NULL, 'dep-programs', TRUE, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('emp-004', 'Demo Area Manager', 'area.manager@example.invalid', NULL, 'dep-operations', TRUE, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('emp-005', 'Demo Passenger Two', 'passenger.two@example.invalid', NULL, 'dep-support', TRUE, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('emp-006', 'Demo Supply Chain Officer', 'supply.chain@example.invalid', NULL, 'dep-supply-chain', TRUE, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('emp-007', 'Demo Passenger Three', NULL, NULL, NULL, TRUE, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('emp-008', 'Demo Passenger Four', NULL, NULL, NULL, TRUE, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_roles (user_id, role) VALUES
  ('emp-001', 'EMPLOYEE'), ('emp-002', 'EMPLOYEE'), ('emp-002', 'SAFETY'), ('emp-002', 'ADMIN'),
  ('emp-003', 'EMPLOYEE'), ('emp-004', 'EMPLOYEE'), ('emp-004', 'AREA_MANAGER'),
  ('emp-005', 'EMPLOYEE'), ('emp-006', 'EMPLOYEE'), ('emp-006', 'SUPPLY_CHAIN'),
  ('emp-007', 'EMPLOYEE'), ('emp-008', 'EMPLOYEE')
ON CONFLICT DO NOTHING;

INSERT INTO vehicles (id, code, plate_number, model, active, created_at, updated_at) VALUES
  ('veh-001', 'DEMO-001', 'DEMO-001', 'Demo 4x4', TRUE, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('veh-002', 'DEMO-002', 'DEMO-002', 'Demo Pickup', TRUE, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('veh-003', 'DEMO-003', 'DEMO-003', 'Demo Minibus', TRUE, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('veh-004', 'DEMO-004', 'DEMO-004', 'Inactive demo vehicle', FALSE, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO drivers (id, name, phone, active, created_at, updated_at) VALUES
  ('drv-001', 'Demo Driver One', NULL, TRUE, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('drv-002', 'Demo Driver Two', NULL, TRUE, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('drv-003', 'Demo Driver Three', NULL, TRUE, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('drv-004', 'Inactive Demo Driver', NULL, FALSE, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO gps_devices (id, code, label, active, created_at, updated_at) VALUES
  ('gps-001', 'GPS-01', 'Garmin GPS 01', TRUE, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('gps-002', 'GPS-02', 'Garmin GPS 02', TRUE, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('gps-003', 'GPS-03', 'Garmin GPS 03', FALSE, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO locations (id, name, latitude, longitude, active, created_at, updated_at) VALUES
  ('loc-office-gaza', 'DRC Office Gaza', 31.5017, 34.4668, TRUE, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('loc-community-center', 'Community Center', NULL, NULL, TRUE, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO system_settings (id, movement_timezone, movement_cutoff_hour, updated_at)
VALUES ('system', 'Asia/Gaza', 12, '2026-01-01T00:00:00.000Z')
ON CONFLICT (id) DO NOTHING;

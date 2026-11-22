ALTER TABLE vehicles
ADD COLUMN capacity INTEGER NOT NULL DEFAULT 8 CHECK (capacity BETWEEN 2 AND 100);

UPDATE users SET
  name = CASE id
    WHEN 'emp-001' THEN 'Demo Employee'
    WHEN 'emp-002' THEN 'Demo Safety Officer'
    WHEN 'emp-003' THEN 'Demo Passenger One'
    WHEN 'emp-004' THEN 'Demo Area Manager'
    WHEN 'emp-005' THEN 'Demo Passenger Two'
    WHEN 'emp-006' THEN 'Demo Supply Chain Officer'
  END,
  email = CASE id
    WHEN 'emp-001' THEN 'employee@example.invalid'
    WHEN 'emp-002' THEN 'safety@example.invalid'
    WHEN 'emp-003' THEN 'passenger.one@example.invalid'
    WHEN 'emp-004' THEN 'area.manager@example.invalid'
    WHEN 'emp-005' THEN 'passenger.two@example.invalid'
    WHEN 'emp-006' THEN 'supply.chain@example.invalid'
  END,
  phone = NULL,
  updated_at = NOW()
WHERE id IN ('emp-001', 'emp-002', 'emp-003', 'emp-004', 'emp-005', 'emp-006');

UPDATE drivers SET
  name = CASE id
    WHEN 'drv-001' THEN 'Demo Driver One'
    WHEN 'drv-002' THEN 'Demo Driver Two'
    WHEN 'drv-003' THEN 'Demo Driver Three'
    WHEN 'drv-004' THEN 'Inactive Demo Driver'
  END,
  phone = NULL,
  updated_at = NOW()
WHERE id IN ('drv-001', 'drv-002', 'drv-003', 'drv-004');

UPDATE vehicles SET
  code = CASE id WHEN 'veh-001' THEN 'DEMO-001' WHEN 'veh-002' THEN 'DEMO-002' WHEN 'veh-003' THEN 'DEMO-003' WHEN 'veh-004' THEN 'DEMO-004' END,
  plate_number = CASE id WHEN 'veh-001' THEN 'DEMO-001' WHEN 'veh-002' THEN 'DEMO-002' WHEN 'veh-003' THEN 'DEMO-003' WHEN 'veh-004' THEN 'DEMO-004' END,
  model = CASE id WHEN 'veh-001' THEN 'Demo 4x4' WHEN 'veh-002' THEN 'Demo Pickup' WHEN 'veh-003' THEN 'Demo Minibus' WHEN 'veh-004' THEN 'Inactive demo vehicle' END,
  capacity = CASE id WHEN 'veh-002' THEN 5 WHEN 'veh-003' THEN 12 ELSE 8 END,
  updated_at = NOW()
WHERE id IN ('veh-001', 'veh-002', 'veh-003', 'veh-004');

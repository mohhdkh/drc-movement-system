ALTER TABLE movements ADD COLUMN IF NOT EXISTS start_location_id TEXT;
ALTER TABLE movements ADD COLUMN IF NOT EXISTS route_point_location_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE movement_segments ADD COLUMN IF NOT EXISTS from_location_id TEXT;
ALTER TABLE movement_segments ADD COLUMN IF NOT EXISTS to_location_id TEXT;
ALTER TABLE movement_segments ADD COLUMN IF NOT EXISTS from_latitude DOUBLE PRECISION;
ALTER TABLE movement_segments ADD COLUMN IF NOT EXISTS from_longitude DOUBLE PRECISION;
ALTER TABLE movement_segments ADD COLUMN IF NOT EXISTS to_latitude DOUBLE PRECISION;
ALTER TABLE movement_segments ADD COLUMN IF NOT EXISTS to_longitude DOUBLE PRECISION;

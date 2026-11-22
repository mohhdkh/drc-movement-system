ALTER TABLE movements ADD COLUMN start_location_id TEXT;
ALTER TABLE movements ADD COLUMN route_point_location_ids_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE movement_segments ADD COLUMN from_location_id TEXT;
ALTER TABLE movement_segments ADD COLUMN to_location_id TEXT;
ALTER TABLE movement_segments ADD COLUMN from_latitude REAL;
ALTER TABLE movement_segments ADD COLUMN from_longitude REAL;
ALTER TABLE movement_segments ADD COLUMN to_latitude REAL;
ALTER TABLE movement_segments ADD COLUMN to_longitude REAL;

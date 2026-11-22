ALTER TABLE users ADD COLUMN entra_object_id TEXT;
ALTER TABLE users ADD COLUMN entra_tenant_id TEXT;
ALTER TABLE users ADD COLUMN entra_principal_name TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_entra_identity
  ON users(entra_tenant_id, entra_object_id)
  WHERE entra_tenant_id IS NOT NULL AND entra_object_id IS NOT NULL;

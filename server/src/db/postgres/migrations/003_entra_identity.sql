ALTER TABLE users ADD COLUMN IF NOT EXISTS entra_object_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS entra_tenant_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS entra_principal_name TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_entra_identity_unique
  ON users (entra_tenant_id, entra_object_id)
  WHERE entra_tenant_id IS NOT NULL AND entra_object_id IS NOT NULL;

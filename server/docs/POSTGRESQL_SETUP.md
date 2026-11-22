# PostgreSQL Operational Persistence

## Architecture

The API selects one operational persistence provider at startup:

```text
Express services -> operational provider -> SQLite | PostgreSQL
SharePoint/Microsoft Graph remains a separate institutional integration.
```

`DATABASE_PROVIDER=sqlite` is the default for local development and automated tests. Set
`DATABASE_PROVIDER=postgres` only after PostgreSQL has been configured and migrated. API contracts and
stable domain IDs (`MOV-*`, `emp-*`, `veh-*`, `drv-*`, and `gps-*`) are identical for both providers.

PostgreSQL-backed requests refresh the compatibility data view before authentication and service logic,
so commits from other API instances become visible. All writes remain owned by the operational provider.

## Configuration

Use either a connection URL:

```dotenv
DATABASE_PROVIDER=postgres
DATABASE_URL=postgresql://application_user:password@database.example:5432/drc_movement
PGSSL=true
PGCHANNELBINDING=require
```

Or discrete settings:

```dotenv
DATABASE_PROVIDER=postgres
PGHOST=localhost
PGPORT=5432
PGDATABASE=drc_movement
PGUSER=drc_application
PGPASSWORD=replace-me
PGSSL=false
```

Optional pool and timeout settings are `PGPOOL_MAX`, `PGPOOL_MAX_LIFETIME_SECONDS`,
`PGCONNECT_TIMEOUT_MS`, `PGIDLE_TIMEOUT_MS`, `PGKEEPALIVE_DELAY_MS`, `PGQUERY_TIMEOUT_MS`,
`PGSTATEMENT_TIMEOUT_MS`, `PGTRANSACTION_IDLE_TIMEOUT_MS`, and `PGLOCK_TIMEOUT_MS`. Defaults are shown
in `.env.example`. Budget `PGPOOL_MAX` across all replicas. Credentials remain server-side and must
never use a `VITE_` prefix.

`PGSSL=true` verifies the server certificate. Hosted connection URLs default to certificate-verified TLS.
The configuration layer removes URL TLS parameters before giving the URL to `pg`, then applies one explicit
TLS object so URL parsing cannot replace it. `channel_binding=require` in the URL or
`PGCHANNELBINDING=require` enables channel binding. `PGSSL=no-verify` is development-only and production
startup rejects it. Keep `sslmode=require` when the provider supplies it; `sslmode=disable` is rejected in
production.

## Local Setup

Create a database and a least-privilege application/migration role using your locally installed PostgreSQL
administration tools. Configure `.env`, then run:

```powershell
cd server
npm run db:postgres:migrate
npm run db:postgres:status
```

Migrations are ordered SQL files in `src/db/postgres/migrations`. They are applied transactionally,
serialized with an advisory lock, and recorded in `schema_migrations`. Startup validates connectivity and
requires all migrations to be current; it never creates or drops the schema. Down migrations are not
provided. Restore from a tested backup when a production rollback requires data reversal.

The canonical seed migration uses stable development IDs and `ON CONFLICT DO NOTHING`. Existing records
are not overwritten by migration startup.

## SQLite Import

Keep `DATABASE_PATH` pointed at the source SQLite file and configure the PostgreSQL target. First run:

```powershell
npm run db:postgres:import:dry-run
```

The dry run validates PostgreSQL connectivity and schema status, validates source IDs/references/stop
times, reports all normalized category counts and existing target IDs, and performs zero PostgreSQL
writes. Resolve unexpected existing target IDs before the initial import.

Import and verify with:

```powershell
npm run db:postgres:import
npm run db:postgres:verify
```

The import is one PostgreSQL transaction protected by an advisory lock. It preserves stable IDs,
timestamps, roles, inactive records, JSON audit snapshots, movements, segments, passengers, arrival and
departure times, reviews, assignments, final decisions, and status history. Upserts make rerunning the
same import idempotent. SQLite is never deleted or modified by these commands. Verification compares all
category counts, relationship integrity, and a representative reconstructed movement. PostgreSQL may contain
additional records created after import; verification reports those as `extraTargetCounts` and fails only when
the target is missing source categories, the representative differs, or relationships are broken.

## Runtime Guarantees

- One `pg.Pool` is used per API process; requests do not create standalone connections.
- Transaction callbacks use one checked-out client and always commit, roll back, and release it.
- Movement aggregates and workflow child records are written atomically.
- Admin record changes and their audit records share one PostgreSQL transaction.
- Movement rows are locked with `FOR UPDATE` to prevent duplicate decisions.
- Sorted transaction-scoped advisory locks serialize GPS, vehicle, and driver allocation.
- Conflict SQL preserves `A.start < B.end AND A.end > B.start`, so touching reservations are allowed.
- `SIGINT` and `SIGTERM` drain the HTTP server and database pool within `SHUTDOWN_TIMEOUT_MS`.
- `GET /api/admin/system/database-status` exposes only provider, connectivity, migration state, server
  time, and a safe message. It is protected by the existing Admin authorization middleware.

## Hosted PostgreSQL And Backups

Use the host's required TLS mode, a least-privilege application role, private networking where available,
and a pool size budgeted across every API replica. A provider-side pooler such as PgBouncer may be needed
for autoscaled hosting. Establish automated backups, retention, encryption, and regularly tested restores
before production deployment. Import tooling is not a backup strategy.

## Validation And Limitations

`npm run db:postgres:validate` checks migration ordering and required schema definitions without a server.
The normal test suite uses isolated SQLite and mocked `pg` boundaries. Live PostgreSQL migrations,
concurrency, restart persistence, import, and verification require a separately configured real test
database and must not be reported as passed unless those commands actually ran against it.

Entra identity links are nullable user fields added by migration `003_entra_identity.sql`; existing users remain
unlinked until their first verified login. The tenant/object pair has a partial unique index. See
`ENTRA_ID_SETUP.md` for activation. Deployment, secret management, monitoring, SharePoint tenant activation,
Excel export, Power Automate, and WhatsApp output remain outside this phase.

Driver behavior follows the official node-postgres documentation for
[pooling](https://node-postgres.com/features/pooling),
[transactions](https://node-postgres.com/features/transactions),
[parameterized queries](https://node-postgres.com/features/queries), and
[TLS/SSL](https://node-postgres.com/features/ssl).

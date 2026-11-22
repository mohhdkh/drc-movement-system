# Production Deployment Runbook

## Required Platform Controls

Deploy the API and built client as separate provider-neutral workloads or behind one HTTPS reverse proxy. Use
a managed secret store, TLS at the edge, restricted network access to PostgreSQL, centralized JSON logs,
monitoring, and alerting. Never commit `.env` or expose server variables through `VITE_` names.

Production startup fails unless `NODE_ENV=production`, `DATABASE_PROVIDER=postgres`, `DATABASE_URL`, `PORT`,
HTTPS `CLIENT_ORIGIN`, `MOVEMENT_TIMEZONE`, `MOVEMENT_CUTOFF_HOUR`, and `AUTH_PROVIDER=entra` are explicit.
All required `ENTRA_*` values must also pass validation. Production rejects development authentication and
disabled PostgreSQL certificate verification. `CLIENT_ORIGIN` accepts a comma-separated allowlist.

Configure `TRUST_PROXY_HOPS` to the exact number of trusted reverse proxies. An incorrect value can make
client IP rate limiting unreliable. Set pool size across all replicas within the Neon connection budget.
SharePoint remains disabled unless its enable flag and credentials are explicitly configured.

Package the official Movement Tracker workbook with the API artifact or set `MOVEMENT_PLAN_TEMPLATE_PATH` to a
readable, trusted `.xlsm` copy. Validate it against `EXCEL_MOVEMENT_PLAN_EXPORT.md` before release.

## Build And Release

```powershell
cd server
npm ci
npm test
npm run production:check
npm run db:postgres:status

cd ../client
npm ci
npm run lint
npm run build
```

Set `VITE_API_BASE_URL` and all public `VITE_ENTRA_*` values at client build time as described in
`ENTRA_ID_SETUP.md`. When the API URL is omitted, production uses same-origin `/api`; it never falls back to
localhost. Never use a client secret in a `VITE_` variable. Apply migrations as an explicit release step:

```powershell
cd server
npm run db:postgres:migrate
npm run db:postgres:status
```

Startup only validates migration state; it does not mutate schema. Launch with `npm run start:production`.

The release order is: deploy the code artifact without routing traffic, run the explicit migration command,
verify migration status, start or restart the application, then require readiness to pass before routing
traffic.

## Probes And Rollout

- Liveness: `GET /api/health/live`. This checks the Node process without a database round trip.
- Readiness: `GET /api/health/ready`. This requires a connected, fully migrated operational database.
- Compatibility: `GET /api/health` remains available for existing monitors.

SharePoint status is included in readiness diagnostics but is not a readiness dependency while the integration
is optional. Route traffic only after readiness returns HTTP 200. Use a rolling release with at least one ready
instance, then perform a representative authorized movement read. `SIGTERM` drains HTTP connections and the
database pool within `SHUTDOWN_TIMEOUT_MS`; set the platform termination grace period higher than that value.

## Observability And Security

Collect stdout as structured JSON. Index `event`, `severity`, `requestId`, `status`, `durationMs`, `actorId`, and
`entityId`. Alert on readiness failures, startup failures, database connection errors, elevated 5xx/429 rates,
and shutdown deadlines. Logs redact credentials and omit query strings and bodies; do not add raw headers or
SQL parameters to logging.

Helmet headers, an explicit CORS allowlist, JSON-only mutation bodies, bounded JSON payloads, stable error
envelopes, and production rate limiting are enabled. Entra access tokens are cryptographically verified by
the API, and local active state and roles remain authoritative. Complete the real-tenant pilot checklist in
`ENTRA_ID_SETUP.md` before routing production users; offline tests do not establish tenant readiness.

## Rollback

Roll back the application image independently when migrations remain backward compatible. Never route
production traffic to an image configured with development authentication; production rejects it. Database down
migrations are not supplied; use the tested backup/restore runbook for a data rollback. After rollback, confirm
liveness, readiness, migration status, SharePoint disabled mode, and a representative movement read. Preserve
the failed release logs and correlation IDs for incident review.

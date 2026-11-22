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

### Container And Review Environment

The root `Dockerfile` builds the Vite client and packages it with the API. The API serves the SPA and `/api`
from one origin when `SERVE_CLIENT=true`, which is the recommended review and production topology. Supply the
public Entra browser settings as Docker build arguments and all server settings as runtime secrets. The runtime
image runs as a non-root user and exposes `/api/health/live` through its container health check.

The root `render.yaml` is a free review-environment blueprint. Because free Render services do not support a
separate pre-deploy migration command, `npm run start:review` applies idempotent, advisory-lock-protected
PostgreSQL migrations before starting the API. Free instances can sleep after inactivity and are not approved
for operational production use. The review Blueprint uses HTTP Basic access in front of fixed local demo
identities. Set a unique `REVIEW_ACCESS_USERNAME` and a password of at least 16 characters in Render; never reuse
an institutional password. This review-only authentication mode must not be used for operational deployment.

For production, use `render.production.yaml` as the reference configuration: it uses paid, always-on compute and
runs migrations in a separate pre-deploy phase before traffic is shifted. During Blueprint creation, provide
every value marked `sync: false`. Use the final HTTPS service URL for both `CLIENT_ORIGIN` and
`VITE_ENTRA_REDIRECT_URI`, and register that exact URL as a Single-page application redirect URI in Entra.

The Entra values map as follows:

- `VITE_ENTRA_CLIENT_ID` and `ENTRA_CLIENT_ID`: application/client ID.
- `VITE_ENTRA_TENANT_ID`, `ENTRA_TENANT_ID`, and `ENTRA_ALLOWED_TENANT_ID`: directory/tenant ID.
- `VITE_ENTRA_API_SCOPE`: the exposed delegated scope, normally `api://<client-id>/access_as_user`.
- `ENTRA_AUDIENCE`: the API application ID URI expected in the token audience.
- `ENTRA_ISSUER`: `https://login.microsoftonline.com/<tenant-id>/v2.0`.

Keep `VITE_API_BASE_URL` unset for the single-origin container. Render supplies `PORT`; the Blueprint supplies
the remaining non-secret production defaults. `DATABASE_URL` must point to the migrated PostgreSQL staging
database and use certificate-verified TLS.

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

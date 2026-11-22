# DRC Movement Management System

An internal full-stack application for managing employee movement requests from submission through Safety,
Supply Chain, and Area Manager approval. The system also supports administration, audit history, official
macro-enabled Excel export, and Arabic WhatsApp summaries.

## Architecture

- React, TypeScript, and Vite client
- Node.js and Express API
- PostgreSQL operational database
- Microsoft Entra ID authentication
- Optional SharePoint integration
- Docker production image serving the client and API from one HTTPS origin

## Local development

Prerequisites: Node.js 24 and npm.

```powershell
cd server
npm ci
Copy-Item .env.example .env
npm run dev
```

In another terminal:

```powershell
cd client
npm ci
npm run dev
```

The local development defaults are `http://localhost:5173` for the client and
`http://localhost:5000/api` for the API. Never commit a populated `.env` file.

## Verification

```powershell
cd server
npm test

cd ../client
npm test
npm run lint
npm run build
```

## Production deployment

The repository includes:

- `Dockerfile` for a non-root, multi-stage production image
- `render.yaml` for a managed staging deployment with readiness checks and pre-deploy database migrations
- `.github/workflows/ci.yml` to gate deployments on client and server verification

Production requires PostgreSQL over verified TLS and Microsoft Entra ID. Development authentication is
intentionally rejected in production. See [Production Deployment](server/docs/PRODUCTION_DEPLOYMENT.md),
[Entra ID Setup](server/docs/ENTRA_ID_SETUP.md), and [PostgreSQL Setup](server/docs/POSTGRESQL_SETUP.md).

## Security notes

- Secrets belong in the hosting provider's secret store, never in Git.
- Browser variables prefixed with `VITE_` are public and must never contain a client secret.
- The API enforces local roles even after Entra authentication.
- Production enables strict CORS, security headers, payload limits, rate limiting, structured redacted logs,
  readiness/liveness probes, and graceful shutdown.

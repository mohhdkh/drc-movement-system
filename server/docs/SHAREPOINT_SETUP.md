# SharePoint and Microsoft Graph Setup

## Architecture

Phase 8 adds an institutional persistence provider alongside SQLite.

- Development default: SQLite only. No Graph request is made.
- SharePoint-enabled mode: validated backend mutations are written to SQLite and then synchronously upserted to SharePoint. The API reports an integration error if SharePoint does not confirm the write.
- SQLite is the local compatibility mirror used by the existing synchronous workflow and conflict checks.
- Synchronization is one way from the application database to SharePoint. External SharePoint edits are not imported automatically and SharePoint never silently overwrites SQLite.
- Records carrying `UpdatedAt` are protected by a freshness check. A newer SharePoint record stops synchronization with `SHAREPOINT_REMOTE_NEWER` instead of being overwritten by the SQLite mirror.
- No synchronization runs during server startup.

Microsoft Graph URLs, tokens, and SharePoint item IDs are isolated under `src/integrations`. Business services continue to use stable domain IDs such as `MOV-*`, `emp-*`, and `veh-*`.

## Azure App Registration

Create a confidential Microsoft Entra application for server-to-server Graph access. This is not application user login.

The integration uses the OAuth 2.0 client credentials flow and requests:

`https://graph.microsoft.com/.default`

Prefer `Sites.Selected` with an explicit write grant to the target site. A broader `Sites.ReadWrite.All` application permission can read and write list items tenant-wide and requires administrator consent. Creating lists may require `Sites.Manage.All` or `Sites.ReadWrite.All`. Apply the least privilege accepted by the organization's SharePoint governance.

Microsoft references:

- https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-client-creds-grant-flow
- https://learn.microsoft.com/en-us/graph/permissions-selected-overview
- https://learn.microsoft.com/en-us/graph/api/site-getbypath
- https://learn.microsoft.com/en-us/graph/api/listitem-list
- https://learn.microsoft.com/en-us/graph/throttling

Never place the tenant ID, client secret, access token, or service credentials in frontend environment files.

## Environment Variables

```env
MS_SHAREPOINT_ENV_ENABLED=false
MS_TENANT_ID=
MS_CLIENT_ID=
MS_CLIENT_SECRET=
MS_SHAREPOINT_HOSTNAME=contoso.sharepoint.com
MS_SHAREPOINT_SITE_PATH=sites/MovementManagement
MS_SHAREPOINT_SITE_ID=
MS_SHAREPOINT_DRIVE_ID=
```

If `MS_SHAREPOINT_SITE_ID` is set, it is used directly. Otherwise the site is resolved with `MS_SHAREPOINT_HOSTNAME` and `MS_SHAREPOINT_SITE_PATH`. `MS_SHAREPOINT_DRIVE_ID` is reserved for the later Excel phase and is not used by Phase 8.

## Lists And Internal Fields

The generic-list `Title` field is populated with the stable domain key. All other internal names are centralized in `sharePointSchema.js`.

| List | Stable key | Other internal fields |
| --- | --- | --- |
| MovementRequests | MovementId | MovementDate, Purpose, OverallETD, OverallETA, StartPoint, Notes, RequesterId, VehicleLeaderId, CurrentStatus, CreatedAt, UpdatedAt |
| MovementSegments | SegmentId | MovementId, SegmentCode, Sequence, FromLocation, ToLocation, ArrivalTime, DepartureTime |
| MovementSegmentPassengers | PassengerRecordId | MovementId, SegmentId, PassengerId, Sequence |
| MovementStatusHistory | HistoryId | MovementId, FromStatus, ToStatus, ActorId, Timestamp, Context |
| Users | UserId | DisplayName, Email, Phone, DepartmentId, RolesJson, Active, CreatedAt, UpdatedAt |
| Departments | DepartmentId | DepartmentName, Active, CreatedAt, UpdatedAt |
| Vehicles | VehicleId | VehicleCode, PlateNumber, Model, Active, CreatedAt, UpdatedAt |
| Drivers | DriverId | DriverName, Phone, Active, CreatedAt, UpdatedAt |
| GPSDevices | GPSDeviceId | GPSCode, GPSLabel, Active, CreatedAt, UpdatedAt |
| Locations | LocationId | LocationName, Latitude, Longitude, Active, CreatedAt, UpdatedAt |
| AdminAuditLog | AuditId | Timestamp, ActorId, ActorName, Action, EntityType, EntityId, BeforeJson, AfterJson |
| SystemSettings | SettingsId | MovementTimezone, MovementCutoffHour, UpdatedAt |
| SafetyReviews | MovementId | Decision, ReviewedBy, ReviewedAt, Comment, GPSDeviceId, ExplicitNoGPS |
| SupplyChainAssignments | MovementId | AssignedBy, AssignedAt, VehicleId, DriverId, Comment |
| AreaManagerApprovals | MovementId | Decision, ReviewedBy, ReviewedAt, Comment |

Roles use deterministic JSON in `RolesJson` so multiple roles retain order and no SharePoint multi-choice behavior is assumed.

## Commands

Run from `server`:

```powershell
npm run sharepoint:verify
npm run sharepoint:provision
npm run sharepoint:sync:dry-run
npm run sharepoint:sync
```

`sharepoint:verify` resolves the site, lists, and columns but makes no changes. In disabled mode it reports that integration is disabled.

`sharepoint:provision` creates only missing lists and missing columns. It does not delete, rename, or change existing columns. In disabled mode it prints the proposed schema and performs no writes. Review the output and institutional governance before enabling it.

`sharepoint:sync:dry-run` reads SQLite and reports counts for every mapped category. It always performs zero SharePoint writes.

`sharepoint:sync` requires enabled, valid configuration. It upserts by stable domain key and never deletes SharePoint records. Repeating it updates matching records rather than creating duplicates. More than one existing match is treated as a reconciliation error.

## Failure And Transaction Behavior

Graph calls have a 15-second timeout, bounded retries for network/5xx failures, and `Retry-After` handling for HTTP 429. A single HTTP 401 invalidates the cached token and retries with a fresh token. HTTP 403 and other permanent failures are not retried indefinitely.

SharePoint has no relational transaction spanning these lists. Aggregate writes use a deterministic parent/child order and stop on the first failure. The resulting error identifies completed operations and the failed list so an operator can reconcile and safely rerun the idempotent sync.

## Status Endpoint

An authenticated Admin can call:

`GET /api/admin/integrations/sharepoint/status`

The response contains enabled/connected/schema state and a safe error code. It never returns credentials, tokens, tenant IDs, or client secrets.

## Current Boundaries

- SharePoint is treated as an application-managed institutional target. Uncontrolled two-way synchronization is intentionally absent.
- Vehicle, driver, and GPS overlap calculations remain backend logic using the existing strict-overlap rule.
- Excel generation, Power Automate, WhatsApp output, Entra ID user login, production secret infrastructure, and deployment hardening are not part of Phase 8.

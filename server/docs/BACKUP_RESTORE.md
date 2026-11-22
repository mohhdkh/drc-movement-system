# PostgreSQL Backup And Restore Runbook

## Ownership And Schedule

The service owner must configure provider-managed automated backups before production traffic. Use encrypted
daily backups, point-in-time recovery when the provider supports it, at least 30 days of retention, and a
separate retention policy that satisfies DRC records requirements. Restrict backup administration and restore
credentials to designated operators. Application credentials are not backup credentials.

Record backup job status in the operations platform and alert on a missed backup, retention failure, or loss
of point-in-time recovery coverage. Review the schedule and access list quarterly.

In addition to provider snapshots and point-in-time recovery, take a logical custom-format backup before a
schema release. Use `pg_dump --format=custom --no-owner --no-acl` with a libpq service name and protected
password file supplied by the secret manager, writing to encrypted storage. Do not put a URL or password on
the command line. Validate the artifact with `pg_restore --list` and record its checksum, size, creation time,
and PostgreSQL tool version. A successful dump command alone is not restore evidence.

## Pre-Restore Checks

1. Open an incident/change record and identify the target recovery point.
2. Stop writes or place the API behind maintenance routing.
3. Preserve the current database as a new provider snapshot.
4. Confirm the target is an isolated restore database, never the active production database.
5. Obtain short-lived restore credentials through the production secret manager.

Never paste connection strings into tickets, shell history, command output, or application logs.

## Restore Drill

Restore the selected provider snapshot to an isolated PostgreSQL database. Configure the validation shell with
its connection secret through the approved secret manager, then run:

```powershell
npm run db:postgres:status
npm run db:postgres:verify
```

Start one isolated API instance against the restored database and check `/api/health/live` and
`/api/health/ready`. Read representative movements in each terminal workflow state and confirm segments,
passengers, stop times, reviews, assignments, approval, status history, and audit records. Do not run the
SQLite import against a restore target.

Record recovery point achieved, elapsed restore time, verification output counts, reviewer, and deletion of
the isolated restore. Run this drill at least quarterly. A backup is not operationally accepted until a restore
drill passes.

## Production Recovery

Promote a restored database only through the provider's documented recovery procedure. Rotate database
credentials, update the secret reference, restart API instances gradually, and require readiness to pass before
adding each instance to service. Verify a representative read and write, then retain the pre-restore snapshot
until the incident owner approves disposal. Roll back by routing to the preserved database if verification fails.

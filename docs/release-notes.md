# Release Notes

## StackMap v1.1.0

### Highlights

- Adds production-only manual Portainer discovery, preview, and explicitly confirmed create-only import.
- Imports selected hosts, services, ports, and bind mounts atomically into authoritative SQLite and records non-secret repeat-import bindings.
- Uses a server-configured HTTPS origin and short-lived in-memory API tokens with a fixed read-only endpoint allowlist.
- Rejects stale, expired, reused, tampered, or already-bound confirmations without partial writes; existing services are never updated or synchronized.
- Keeps portable backup schema version 1 unchanged. Successful full restore clears Portainer provenance transactionally.
- The public demo remains isolated and contains no Portainer integration.

### Upgrade guidance

Before upgrading, download a server JSON backup and stop StackMap cleanly to make a cold backup of the
complete `/config` directory. Preserve the same `/config` mount when recreating the container and wait
for the health check before verifying inventory and Portainer import in the UI.

The SQLite database schema migrates forward transactionally at startup. StackMap v1.1.0 adds Portainer
provenance tables while leaving portable JSON backup schema version 1 unchanged. Rollback is safe only
when the older image recognizes the upgraded database schema. Otherwise, stop StackMap and restore the
matching cold `/config` backup before starting the older image; do not run an older image against an
unsupported schema.

### Known limitations

- Portainer import is manual and create-only. There is no synchronization, polling, background refresh,
  automatic import, overwrite, merge, or update of existing services.
- Import supports only the approved read-only Portainer environment, Docker info/version, and container
  list routes. It does not inspect containers, access the Docker socket, or mutate Portainer or Docker.
- Bind mounts can be imported; named and anonymous volume backing paths are skipped with a warning.
  Multiple networks require explicit selection, and dependencies are not inferred.
- API tokens are entered for each discovery session and remain only in short-lived server memory.
- Published container validation covers Linux/amd64; ARM64 remains unvalidated.

### Validation

Release-candidate validation passed lint, 196 unit/integration/component tests, production and demo
builds, 12 production browser E2E tests, the isolated demo E2E test, the production dependency audit,
Linux/amd64 image and deployment/backup/upgrade/failure regressions, `git diff --check`, and Semgrep.

## StackMap v1.0.0

**Status:** Released. The `v1.0.0` tag and GitHub Release exist. The production container and public demo
were published through their separately approved workflows.

### Highlights

- One non-root Node.js 24/Fastify process serves the React application and same-origin API.
- SQLite at `/config/stackmap.db` is authoritative for all production inventory and is shared across browsers.
- The normalized inventory includes hosts, services, ordered ports, ordered paths, and dependencies with optimistic concurrency.
- Server backup schema version 1 supports complete portable export plus validated, explicitly confirmed, atomic replacement.
- Forward database migrations, health checks, graceful shutdown, durable restart/recreation, concurrent-client conflicts, cold backup/restore, unsupported-schema failure, and unwritable-volume failure are validated.
- Retired IndexedDB data is never opened, changed, or deleted by the current application.
- The separate Cloudflare Pages demo uses bundled sample data and session-only memory with no production or browser persistence.

### Upgrade notes

Before changing images, download a server JSON backup and make a cold backup of the complete stopped
`/config` directory. Preserve the same `/config` mount when recreating the container. Migrations are
forward-only; rollback requires an image that understands the current schema or the matching cold backup.
See [Deployment and operations](deployment-and-operations.md).

### Legacy-data note

The temporary browser migration workflow has ended. Existing successfully migrated SQLite inventories
remain compatible. Browser-local data that was not migrated must be recovered with a compatible older
release or an existing JSON export. Current StackMap does not inspect or delete that browser data.

### Known limitations

- JSON restore supports server backup schema version 1 only and is manual, destructive, and replace-only.
- Scheduled, cloud, incremental, partial, and merge backup/restore are not available.
- Cold backup requires a cleanly stopped container and the complete `/config` directory; live copying of
  only `stackmap.db` is unsupported.
- Database migrations are forward-only, and older images may require a matching cold backup.
- Authentication, accounts, telemetry, external persistence, Docker socket access, automatic discovery,
  monitoring, and automatic updates are not included.
- Published container validation currently covers Linux/amd64 only; ARM64 remains unvalidated.
- Demo edits are intentionally temporary and reset on refresh; the demo is not a hosted production edition.

### Validation expected before release approval

- Lint, unit/integration/component tests, production build, and production browser E2E
- Demo build, artifact safeguards, and focused demo browser E2E
- Production dependency audit
- Linux/amd64 image build, container smoke validation, and deployment/backup/upgrade/failure matrix
- Link and command review, `git diff --check`, exact-head GitHub Actions, and Semgrep

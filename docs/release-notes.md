# Release Notes

## StackMap v1.1.3

### Highlights

- Accepts valid Docker container-list port summaries for unpublished ports when `IP` is omitted and `PublicPort` is omitted or null.
- Keeps unpublished container ports in Portainer preview and import without manufacturing host-port mappings or conflicts.
- Preserves published-port behavior, strict required-field validation, duplicate and protocol handling, and all existing Portainer security and create-only import boundaries.

### Upgrade guidance

Before upgrading, download a server JSON backup and stop StackMap cleanly to make a cold backup of the complete `/config` directory. Preserve the same `/config` mount when recreating the container. Version 1.1.3 makes no database or portable-backup schema change, so existing v1.1.2 data remains compatible.

### Known limitations

- Portainer import remains manual and create-only, with no synchronization, polling, background refresh, overwrite, merge, or service updates.
- Cleartext HTTP remains restricted to destinations resolving exclusively to RFC1918 IPv4; HTTPS remains preferred.
- Cloudflare Access integration and custom TLS trust controls are not included.
- Published container validation covers Linux/amd64; ARM64 remains unvalidated.

### Validation

Release-candidate validation covers exact real-world unpublished-port response shapes, strict required and malformed-field rejection, published-port compatibility, preview and import behavior, the complete application and demo suites, and Linux/amd64 container validation.

## StackMap v1.1.2

### Highlights

- Recognizes valid local Docker Portainer environments that report `Type: 1` with a blank `ContainerEngine`.
- Preserves support for environments that explicitly report the Docker container engine and continues rejecting unsupported or non-Docker endpoint types.
- Keeps the existing manual, create-only import workflow, SQLite provenance, short-lived API-token handling, fixed read-only route allowlist, RFC1918 HTTP policy, HTTPS validation, and public-demo isolation unchanged.

### Upgrade guidance

Before upgrading, download a server JSON backup and stop StackMap cleanly to make a cold backup of the complete `/config` directory. Preserve the same `/config` mount when recreating the container. Version 1.1.2 makes no database or portable-backup schema change, so existing v1.1.1 data remains compatible.

### Known limitations

- Portainer import remains manual and create-only, with no synchronization, polling, background refresh, overwrite, merge, or service updates.
- Cleartext HTTP remains restricted to destinations resolving exclusively to RFC1918 IPv4; HTTPS remains preferred.
- Cloudflare Access integration and custom TLS trust controls are not included.
- Published container validation covers Linux/amd64; ARM64 remains unvalidated.

### Validation

Release-candidate validation covers the exact local Docker endpoint response, explicit Docker-engine compatibility, unsupported/non-Docker rejection, existing discovery and import regressions, the complete application and demo suites, and Linux/amd64 container validation.

## StackMap v1.1.1

### Highlights

- Allows `STACKMAP_PORTAINER_URL` to use HTTP only when startup resolution and every actual connection resolve exclusively to RFC1918 IPv4.
- Pins each HTTP connection to its validated address set while preserving the configured hostname, preventing DNS rebinding from redirecting API-token traffic.
- Rejects public, mixed, IPv6, loopback, link-local, metadata-service, multicast, unspecified, CGNAT, and every other non-RFC1918 HTTP destination before sending credentials.
- Preserves HTTPS certificate validation, redirect rejection, the fixed GET-only endpoint allowlist, short-lived in-memory tokens, strict response projection, SQLite authority, and public-demo isolation.

### Upgrade guidance

Before upgrading, download a server JSON backup and stop StackMap cleanly to make a cold backup of the complete `/config` directory. Preserve the same `/config` mount when recreating the container. Version 1.1.1 makes no database or portable-backup schema change, so existing v1.1.0 data remains compatible.

HTTPS remains preferred. Operators choosing HTTP must use a trusted private LAN and understand that cleartext traffic exposes the Portainer API token and discovered inventory to observers on that network. There is no TLS-verification bypass.

### Known limitations

- HTTP is limited to destinations resolving exclusively to `10.0.0.0/8`, `172.16.0.0/12`, or `192.168.0.0/16`; IPv6 and mixed address sets are rejected.
- Portainer import remains manual and create-only, with no synchronization, polling, background refresh, overwrite, merge, or service updates.
- Cloudflare Access integration and custom TLS trust controls are not included.
- Published container validation covers Linux/amd64; ARM64 remains unvalidated.

### Validation

Release-candidate validation covers focused address-policy, DNS-rebinding, connection-pinning, redirect, credential, and HTTPS regressions; the complete application and demo suites; and a real RFC1918 Docker-network Portainer import through the hardened production container.

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

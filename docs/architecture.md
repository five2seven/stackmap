# Architecture

## Current implementation

StackMap runs as a React, TypeScript, and Vite single-page application served by a Node.js 24/Fastify 5 process. The frontend uses a typed same-origin HTTP repository, and SQLite at `/config/stackmap.db` is authoritative for all normal inventory reads and writes. Multiple browsers share the same server inventory.

Server inventory and legacy browser data use separate JSON formats and explicitly separate export actions. Server-authoritative export and restore use exact-shape server backup schema version 1. Legacy browser export and migration accept exact schema version 3; server restore does not. The legacy boundary uses read-only IndexedDB access so records are not upgraded, deleted, or otherwise modified.

## Approved target architecture

StackMap is a self-hosted Docker web application retaining the React, TypeScript, and Vite frontend. A Node.js 24 LTS and TypeScript server using Fastify 5 serves a same-origin API and the compiled frontend. SQLite, accessed with better-sqlite3, is the durable primary datastore at `/config/stackmap.db`.

The production deployment remains one non-root container and one process. A `/config` bind mount is required so inventory survives container recreation and can participate in normal Docker or NAS backup procedures.

IndexedDB is transitional legacy storage only. A blocking interstitial prevents ambiguous editing when legacy records exist and offers explicit export or transactional migration into an empty SQLite inventory. A matching server receipt bypasses repeat migration; deliberate continuation starts the HTTP-only application without writing a migration or synchronization result to IndexedDB.

JSON export remains a portable backup format. The application does not require an external database, cloud service, account system, telemetry, or Docker socket access.

## Data and application behavior

The existing host, service, port, path, dependency, validation, deletion, search, filter, Port Map, and Path Map behavior remains unless an approved migration task explicitly changes it. Derived maps remain projections of the authoritative inventory rather than separately persisted datasets.

Database migrations must be transactional and fail closed. Data migration and restore operations must preserve IDs and timestamps, validate input, and protect existing data through explicit confirmation and rollback behavior.

## Hosting

The final production product is the self-hosted Node.js application with durable `/config` storage. Cloudflare Pages cannot host that full product. A separate public demo may use Cloudflare Pages only with an in-memory repository, bundled sample data, session-only edits, a clear demo banner, and no IndexedDB or server persistence.

The intended public demo URL remains `stackmap.rareobjectlabs.app`, and the source repository is `five2seven/stackmap`.

## Testing

Use Vitest and Testing Library for unit and component behavior, Playwright for critical browser workflows, and `npm run build` for production build validation. Tasks involving the Node runtime, better-sqlite3, container image, `/config`, persistence, health, permissions, shutdown, or upgrades also require relevant native and Docker validation at the time those capabilities are introduced.

## Constraints

- Keep data access separate from UI components.
- Preserve backward compatibility where required by the active task.
- Validate imports rather than trusting uploaded JSON.
- Do not store credentials or secrets in client code.
- Do not add authentication, external persistence, telemetry, or Docker socket access without explicit approval.
- Keep IndexedDB isolated to explicit read-only legacy detection, export, and migration behavior.
# Server backup format

Task 5 defines server backup schema version `1`. A backup is JSON with the exact top-level keys
`schemaVersion`, `metadata`, `hosts`, and `services`. Metadata has the exact keys `exportedAt`,
`sourceInstallationId`, `sourceInventoryRevision`, and `applicationVersion`; all are informational.
Hosts and services use the complete production API record shape, including source record revisions,
IDs, timestamps, ordered ports, ordered paths, and ordered dependency IDs. Source record revisions are
not restored: hosts and services start at revision 1. The source installation and inventory revision
never replace target metadata.

Only schema version 1 is supported. Unknown fields, older versions, and future versions fail closed.
Adding a version requires an explicit parser and immutable conversion to the current validated model.
Restore uses non-mutating preview followed by an opaque, single-use, five-minute token and the target
revision observed at preview. Confirmation replaces the complete inventory in one SQLite transaction,
then advances the target inventory revision exactly once. The target installation identity, database
creation time, migrations, pragmas, WAL state, path, and filesystem state are outside the backup format.
Preview tokens and their validated backups are held in memory per application instance. At most eight
unused previews may be active, limiting retained upload data to a conservative bound for a self-hosted
single-process deployment. Expired and consumed previews free capacity; process restart invalidates all
previews. A capacity-full server rejects new previews safely instead of evicting one under review.

## Legacy browser migration

Database schema migration 3 adds the singleton `legacy_migration_receipt` table. Its SHA-256 dataset
fingerprint, import timestamp, resulting inventory revision, and legacy schema version identify the one
legacy dataset most recently imported; receipt metadata is deliberately excluded from Task 5 server
backups. The status endpoint compares a freshly validated fingerprint without exposing it. An unchanged
dataset with a matching receipt no longer blocks startup, while changed legacy data fails closed and
requires a new preview.

Only the exact legacy schema version 3 shape is accepted. IndexedDB enumeration, detection, export, and
confirmation rereads use the read-only browser boundary and abort any open request that would create or
upgrade a database. Migration is manual: preview verifies that every SQLite inventory table is empty,
returns summary counts, the coherent target revision, and an opaque single-use token, then confirmation
rereads and fingerprints the complete legacy dataset. Tokens live for five minutes and at most eight may
be active per process.

Confirmation rechecks the revision and all-table emptiness inside the import transaction. A process guard
and SQLite transaction allow at most one successful confirmation. Hosts, services, ordered ports, paths,
and dependencies are inserted atomically with IDs and timestamps preserved; host and service record
revisions start at 1, the global inventory revision advances exactly once, and the receipt is written in
the same transaction. Migration never merges, overwrites, or deletes IndexedDB. SQLite remains the sole
production authority. Task 7 retains responsibility for removing the remaining legacy compatibility
boundary after its retirement criteria are approved.

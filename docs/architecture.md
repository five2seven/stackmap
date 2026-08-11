# Architecture

## Current implementation

StackMap runs as a React, TypeScript, and Vite single-page application served by a Node.js 24/Fastify 5 process. The frontend uses a typed same-origin HTTP repository, and SQLite at `/config/stackmap.db` is authoritative for all normal inventory reads and writes. Multiple browsers share the same server inventory.

Server-authoritative export and restore use exact-shape server backup schema version 1. The retained
legacy JSON conversion library still understands application data schema versions 1 through 3, but the
current production restore endpoint accepts only server backup schema version 1. The retired legacy
browser boundary is no longer accessed, and browser data is neither read nor modified.

## Approved target architecture

StackMap is a self-hosted Docker web application retaining the React, TypeScript, and Vite frontend. A Node.js 24 LTS and TypeScript server using Fastify 5 serves a same-origin API and the compiled frontend. SQLite, accessed with better-sqlite3, is the durable primary datastore at `/config/stackmap.db`.

The production deployment remains one non-root container and one process. A `/config` bind mount is required so inventory survives container recreation and can participate in normal Docker or NAS backup procedures.

IndexedDB is retired legacy storage only. The application does not enumerate, open, read, write, migrate, synchronize, or delete browser databases. Previously completed migrations remain ordinary SQLite inventory, and their schema-3 receipt rows remain compatible metadata.

JSON export remains a portable backup format. The application does not require an external database, cloud service, account system, telemetry, or Docker socket access.

## Data and application behavior

The existing host, service, port, path, dependency, validation, deletion, search, filter, Port Map, and Path Map behavior remains unless an approved migration task explicitly changes it. Derived maps remain projections of the authoritative inventory rather than separately persisted datasets.

Database migrations must be transactional and fail closed. Data migration and restore operations must preserve IDs and timestamps, validate input, and protect existing data through explicit confirmation and rollback behavior.

Production upgrade validation confirms that databases migrate forward in place while preserving
installation identity and inventory. Unknown migration versions fail startup without serving or changing
inventory. Rollback is therefore an image-and-database compatibility operation, not a reverse migration:
an older image requires a schema it recognizes or a matching cold backup of the complete stopped
`/config` directory. A live copy of only `stackmap.db` is not an operationally supported backup boundary.

## Hosting

The final production product is the self-hosted Node.js application with durable `/config` storage. Cloudflare Pages cannot host that full product. The separate Cloudflare Pages build statically selects an in-memory repository with bundled sample data, session-only edits, and a clear demo banner. Its build artifact excludes the production HTTP repository, SQLite paths and dependencies, IndexedDB, and browser-storage persistence. Refreshing the page creates a new repository from the bundled data.

The normal production build statically selects the same-origin HTTP repository and server backup client. The demo build does not change or provide a fallback for that self-hosted runtime.

The planned public demo URL is `https://stackmap.rareobjectlabs.app`, and the source repository is
`https://github.com/five2seven/stackmap`.

## Testing

Use Vitest and Testing Library for unit and component behavior, Playwright for critical browser workflows,
and `npm run build` for production build validation. The separate demo boundary is validated with
`npm run build:demo` and `npm run test:e2e:demo`; the build includes a static artifact scan for forbidden
production and persistence paths. Tasks involving the Node runtime, better-sqlite3, container image,
`/config`, persistence, health, permissions, shutdown, or upgrades also require relevant native and
Docker validation at the time those capabilities are introduced.

## Constraints

- Keep data access separate from UI components.
- Preserve backward compatibility where required by the active task.
- Validate imports rather than trusting uploaded JSON.
- Do not store credentials or secrets in client code.
- Do not add authentication, external persistence, telemetry, or Docker socket access without explicit approval.
- Do not access or delete retired browser IndexedDB data.
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

## Retired legacy browser migration

Database schema migration 3 and its singleton `legacy_migration_receipt` table remain unchanged for
compatibility with databases that completed the Task 6 migration. Receipt metadata remains excluded from
Task 5 server backups and does not affect normal inventory reads, writes, backup, or restore.

The browser reader, Dexie dependency, migration interface, and migration API are retired. Current
application code never accesses or deletes IndexedDB. Existing SQLite records imported during Task 6
remain authoritative and keep their IDs and timestamps; no current endpoint can initiate another legacy
migration or alter its receipt.

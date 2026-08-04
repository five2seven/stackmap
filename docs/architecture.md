# Architecture

## Current implementation

StackMap runs as a React, TypeScript, and Vite single-page application served by a Node.js 24/Fastify 5 process. The frontend uses a typed same-origin HTTP repository, and SQLite at `/config/stackmap.db` is authoritative for all normal inventory reads and writes. Multiple browsers share the same server inventory.

The current JSON export schema is version 3. Server inventory and legacy browser data have explicitly separate export actions. Server-authoritative restore remains deferred. Dexie remains installed only at the legacy boundary; detection and export use read-only IndexedDB access so legacy records are not upgraded, imported, deleted, or otherwise modified.

## Approved target architecture

StackMap is a self-hosted Docker web application retaining the React, TypeScript, and Vite frontend. A Node.js 24 LTS and TypeScript server using Fastify 5 serves a same-origin API and the compiled frontend. SQLite, accessed with better-sqlite3, is the durable primary datastore at `/config/stackmap.db`.

The production deployment remains one non-root container and one process. A `/config` bind mount is required so inventory survives container recreation and can participate in normal Docker or NAS backup procedures.

IndexedDB is transitional legacy storage only and is retained for the later explicit, data-safe migration. A blocking interstitial prevents ambiguous editing when legacy records exist; deliberate continuation starts the HTTP-only application without writing either a migration or synchronization result to IndexedDB.

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
- Keep IndexedDB isolated to explicit legacy detection, export, and later migration behavior.

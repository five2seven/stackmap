# Architecture

## Current implementation

StackMap currently runs as a React, TypeScript, and Vite single-page application. Inventory remains in browser IndexedDB through Dexie, and the existing self-hosted image serves static assets from nginx without an application-data volume. This is transitional implementation state, not the approved final architecture.

The current JSON export schema is version 3. Import accepts compatible versions 1 through 3, validates uploaded data before replacement, and migrates legacy identity and path fields without mutating uploaded objects. Dexie database version 4 similarly converts legacy path fields while preserving timestamps. IndexedDB and JSON schema versions are independent.

## Approved target architecture

StackMap will become a self-hosted Docker web application while retaining the React, TypeScript, and Vite frontend. A Node.js 24 LTS and TypeScript server using Fastify 5 will serve a same-origin API and the compiled frontend. SQLite, accessed with better-sqlite3, will become the durable primary datastore at `/config/stackmap.db`.

The production deployment should remain one non-root container and one process when practical. A `/config` bind mount will be required so inventory survives container recreation and can participate in normal Docker or NAS backup procedures. Multiple browsers and devices will share the server inventory.

IndexedDB is transitional legacy storage only. It remains authoritative until a coordinated frontend cutover and is retained afterward only long enough to support an explicit, data-safe legacy migration. The migration plan must never split normal inventory authority between IndexedDB and SQLite.

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
- Treat the target architecture as approved direction, not as already implemented behavior.

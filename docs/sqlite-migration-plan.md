# SQLite Migration Plan

## Target architecture

StackMap will retain its React frontend and add a TypeScript server on Node.js 24 LTS using Fastify 5, better-sqlite3, and plain SQL migrations. Fastify will serve the built Vite frontend and a same-origin API under `/api/v1`. The application will run as one process with one exposed port in a non-root Debian slim container; nginx will be removed from the final architecture.

The SQLite database will live at `/config/stackmap.db`. Foreign keys and WAL mode will be enabled. Migrations will be transactional and fail closed. The server will close HTTP and database resources gracefully.

## Data requirements

- Data persists through container recreation and upgrades and is backed up through the `/config` bind mount.
- Inventory is shared across browsers and devices without an external database, cloud dependency, or user account.
- JSON export remains supported.
- Migration from legacy IndexedDB is opt-in, explicit, and data-safe.

## Phased backlog

Only Task 1 is Ready. Tasks 2 through 11 remain blocked until every listed dependency is Complete.

### 1. API and SQLite foundation

- **Status:** Ready
- **Branch:** `codex/sqlite-foundation`
- **Goal:** Add the minimal production-shaped server, SQLite connection, and migration bootstrap.
- **Scope:** TypeScript Fastify server; configurable SQLite path; migration runner and `schema_migrations`; required pragmas; health and metadata endpoints; Vite static serving and SPA fallback; graceful shutdown; local development arrangement; focused tests.
- **Explicit exclusions:** Domain tables and repositories; frontend persistence changes; backup/restore; legacy migration; Docker runtime conversion; authentication; CORS; release work.
- **Acceptance criteria:** Server and database lifecycle are tested; migrations are transactional; WAL and foreign keys are enabled; `/health` and `/api/v1/meta` work; built frontend and SPA fallback are served; existing IndexedDB behavior is unchanged.
- **Required tests:** Unit tests for configuration and migrations; integration tests for endpoints, static serving, fallback, and shutdown; existing lint, unit/component, build, and E2E suites.
- **Dependencies:** None.
- **Completion notes:** Pending.

### 2. Normalized SQLite schema and repository

- **Status:** Blocked
- **Branch:** `codex/sqlite-domain-repository`
- **Goal:** Define the normalized domain schema and a tested server-side repository.
- **Scope:** Tables, constraints, indexes, revisions, transactional CRUD primitives, and repository tests for the existing StackMap model.
- **Explicit exclusions:** HTTP domain routes, frontend migration, backup/restore, IndexedDB migration, and Docker changes.
- **Acceptance criteria:** Schema preserves current IDs and timestamps, enforces relationships, supports optimistic concurrency, and round-trips all domain records transactionally.
- **Required tests:** Migration, constraint, rollback, repository CRUD, concurrency, and compatibility fixtures.
- **Dependencies:** Task 1 Complete.
- **Completion notes:** Pending.

### 3. Host API and frontend repository migration

- **Status:** Blocked
- **Branch:** `codex/host-api-migration`
- **Goal:** Make hosts server-authoritative through versioned API routes and the frontend repository boundary.
- **Scope:** Host endpoints, validation, conflict handling, frontend host repository adapter, and tests.
- **Explicit exclusions:** Services and child records, backups, legacy migration, Docker changes, and Dexie removal.
- **Acceptance criteria:** Existing host workflows use the API without behavior regression and handle revisions and failures safely.
- **Required tests:** Route, validation, repository-adapter, component, and host E2E coverage.
- **Dependencies:** Task 2 Complete.
- **Completion notes:** Pending.

### 4. Service API migration

- **Status:** Blocked
- **Branch:** `codex/service-api-migration`
- **Goal:** Move core service records to the server-authoritative API.
- **Scope:** Service routes, validation, revisions, frontend service repository adapter, and tests excluding child persistence.
- **Explicit exclusions:** Ports, paths, dependencies, backup/restore, legacy migration, Docker changes, and Dexie removal.
- **Acceptance criteria:** Core service workflows use SQLite through the API while preserving existing visible behavior.
- **Required tests:** Route, validation, concurrency, adapter, component, and service E2E coverage.
- **Dependencies:** Task 3 Complete.
- **Completion notes:** Pending.

### 5. Port, path, and dependency persistence

- **Status:** Blocked
- **Branch:** `codex/service-child-persistence`
- **Goal:** Persist service child collections and relationships in normalized SQLite tables.
- **Scope:** API and repository behavior for ports, path mappings, and service dependencies, including ordering and transactional replacement.
- **Explicit exclusions:** Backup/restore, legacy migration, Docker conversion, and Dexie removal.
- **Acceptance criteria:** Child records preserve stable IDs and existing projections, warnings, conflicts, and relationships across reloads and clients.
- **Required tests:** Transaction, rollback, relationship, API, component, Port Map, Path Map, and E2E coverage.
- **Dependencies:** Task 4 Complete.
- **Completion notes:** Pending.

### 6. Server-authoritative JSON backup and restore

- **Status:** Blocked
- **Branch:** `codex/server-backup-restore`
- **Goal:** Move JSON export and import to validated, transactional server operations.
- **Scope:** Version 1-3 import compatibility, current export, size limit, validation, dry-run/confirmation behavior, and atomic restore.
- **Explicit exclusions:** Automatic legacy IndexedDB migration, live SQLite backup automation, Docker changes, and Dexie removal.
- **Acceptance criteria:** Exports are complete; invalid imports cannot change data; confirmed imports preserve IDs/timestamps and replace data atomically.
- **Required tests:** Schema fixtures for versions 1-3, size limit, invalid input, rollback, confirmation, API, and E2E coverage.
- **Dependencies:** Task 5 Complete.
- **Completion notes:** Pending.

### 7. Opt-in legacy IndexedDB migration

- **Status:** Blocked
- **Branch:** `codex/indexeddb-migration`
- **Goal:** Let users explicitly copy legacy browser data into an empty server safely.
- **Scope:** Detection, preview, consent, empty-server default, destructive confirmation for populated servers, idempotency, and user-facing results.
- **Explicit exclusions:** Silent migration, IndexedDB deletion, primary Dexie removal, and Docker changes.
- **Acceptance criteria:** Nothing migrates without consent; existing server data is protected; IDs/timestamps are preserved; failures leave both stores intact.
- **Required tests:** Empty/populated server, consent, cancellation, retry, rollback, compatibility, component, and E2E coverage.
- **Dependencies:** Task 6 Complete.
- **Completion notes:** Pending.

### 8. Docker /config volume and Node runtime

- **Status:** Blocked
- **Branch:** `codex/sqlite-docker-runtime`
- **Goal:** Replace nginx with the production Node runtime and durable `/config` storage.
- **Scope:** Non-root Debian slim image, one process/port, bind mount, health check, permissions, shutdown, Compose, and deployment documentation.
- **Explicit exclusions:** New domain behavior, live backup automation, ARM64 guarantee, authentication, and cloud deployment provisioning.
- **Acceptance criteria:** Data survives recreation and upgrade; permissions and health checks work; shutdown is graceful; nginx is absent.
- **Required tests:** Image build, Compose startup, health, persistence/recreation, upgrade, permissions, shutdown, and application smoke tests.
- **Dependencies:** Task 7 Complete.
- **Completion notes:** Pending.

### 9. Remove IndexedDB as primary persistence

- **Status:** Blocked
- **Branch:** `codex/remove-primary-indexeddb`
- **Goal:** Make SQLite the sole primary datastore after migration support is proven.
- **Scope:** Remove primary Dexie repository paths and dependencies while retaining the approved migration/import boundary.
- **Explicit exclusions:** Deleting browser data, unrelated UI refactors, release work, and new features.
- **Acceptance criteria:** Normal use never reads or writes IndexedDB; opt-in migration remains safe; all workflows use the API.
- **Required tests:** Dependency checks, repository/component suites, migration regression, full E2E, and production build.
- **Dependencies:** Task 8 Complete.
- **Completion notes:** Pending.

### 10. Deployment, upgrade, and multi-client validation

- **Status:** Blocked
- **Branch:** `codex/sqlite-deployment-validation`
- **Goal:** Prove persistence, upgrades, and shared multi-client behavior in production-like deployments.
- **Scope:** Automated/manual validation fixtures for recreation, schema upgrade, backup restore, concurrent clients, failure recovery, and Portainer-relevant deployment behavior.
- **Explicit exclusions:** New product features, ARM64 support, live backup automation, and release publication.
- **Acceptance criteria:** Documented scenarios pass without data loss; failures are diagnosable; rollback limits are explicit.
- **Required tests:** Full lint/unit/build/E2E suite plus Docker recreation, upgrade, restore, concurrency, health, and smoke validation.
- **Dependencies:** Task 9 Complete.
- **Completion notes:** Pending.

### 11. Documentation and SQLite release preparation

- **Status:** Blocked
- **Branch:** `codex/sqlite-release-preparation`
- **Goal:** Align public and internal documentation for the SQLite-backed release.
- **Scope:** README, architecture, decisions, deployment, backup/restore, upgrade, limitations, release checklist, and release notes.
- **Explicit exclusions:** Product features, infrastructure provisioning, merging, tagging, and publishing unless separately approved.
- **Acceptance criteria:** Documentation accurately describes current behavior, data safety, supported deployment, backups, upgrades, and limitations without legacy contradictions.
- **Required tests:** Documentation link/command review, full application validation, and applicable Docker smoke checks.
- **Dependencies:** Task 10 Complete.
- **Completion notes:** Pending.

## Open decisions and defaults

- Use integer revision fields for optimistic concurrency.
- Migrate legacy data into an empty server by default.
- Require additional destructive confirmation when server data already exists.
- Begin with a 10 MiB JSON import limit.
- Initially document cold `/config` backup.
- Defer live SQLite-aware backup automation.
- Cloudflare Pages is no longer an equivalent production target.
- Defer ARM64 support until native dependency validation.
- Migrate old database schemas forward only.
- Image rollback may require restoring a matching database backup.

## Completion rules

- Only one task may be In Progress.
- A task becomes Complete only after implementation, review, merge, and synchronization of `main`.
- Mark the next blocked task Ready only after every dependency is Complete.
- Each completion entry records the implementation commit, merge commit, Entire checkpoint, validation summary, and known limitations.

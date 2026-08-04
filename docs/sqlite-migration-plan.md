# SQLite Migration Plan

## Target architecture and authority

StackMap will retain React, TypeScript, and Vite and add a Node.js 24 LTS TypeScript server using Fastify 5, better-sqlite3, and plain SQL migrations. One non-root process will serve the compiled frontend and a same-origin `/api/v1` API from a self-hosted container. SQLite will live at `/config/stackmap.db` on a durable bind mount.

The current implementation remains authoritative for implemented behavior. IndexedDB remains the sole authoritative inventory datastore through Tasks 1 to 3. Task 4 performs one coordinated cutover of the complete inventory model to SQLite. From Task 4 onward, SQLite is authoritative for all normal inventory operations; IndexedDB is retained only at the explicit legacy-migration boundary. No phase may split normal inventory authority between the two stores.

JSON export remains supported. Legacy migration is opt-in and data-safe. Database migrations and replacements are transactional and fail closed, and IDs and timestamps are preserved.

## Phased backlog

Tasks 1 through 4 are Complete, and Task 5 is Ready. Tasks 6 through 10 remain Blocked until all listed dependencies are Complete and no unresolved decision or failed validation prevents safe advancement.

### 1. API, SQLite, and target-runtime proof

- **Status:** Complete
- **Branch:** `codex/sqlite-foundation`
- **Goal:** Prove the complete server, native dependency, and production-container foundation before adding inventory persistence.
- **Datastore authority after completion:** IndexedDB remains the sole authoritative inventory datastore; SQLite contains infrastructure metadata only.
- **Scope:** Minimal TypeScript Fastify server; SQLite connection through better-sqlite3; configurable database path defaulting to `/config/stackmap.db` in production; bootstrap migration runner and `schema_migrations`; required pragmas; `/health`; `/api/v1/meta`; Vite static serving and SPA fallback; graceful shutdown; local development arrangement; Windows native dependency validation; Linux production image; non-root runtime; health check; `/config` bind-mount writability; bootstrap metadata persistence across container restart; focused tests.
- **Explicit exclusions:** Inventory tables, repositories, or APIs; frontend persistence changes; JSON backup changes; legacy migration; Dexie removal; public demo; authentication; CORS; release work.
- **Acceptance criteria:** The server and database lifecycle work locally and in the target Linux container; better-sqlite3 installs on Windows and runs in the image; migrations are transactional; WAL and foreign keys are enabled; endpoints and static serving work; the non-root process can write the mounted database; bootstrap metadata survives restart; no inventory record is written to SQLite.
- **Required tests:** Configuration, migration, endpoint, static-serving, fallback, and shutdown tests; Windows native install/runtime check; Linux image build; container health, permissions, bind-mount writability, restart-persistence, and shutdown checks; lint, unit/component, build, E2E, and `git diff --check`.
- **Dependencies:** None.
- **Completion notes:** Implemented on `codex/sqlite-foundation` in commits `ae78567fde10e90d75913550d09fe1fb1c0d7157`, `1d8cb5d0ad808d53ed3be43bf091a6994e522d99`, and `8f3da39bf563d6f5f667e15b50ec0498062ced84` (final head). Entire checkpoints: `634ba1dbfd2e`, `dd8fb7e70650`, and `2a19e6dce3ab`. PR #1 merged as `775dd581bcc796bddccdb50b3cf7f225ae4f8ab3`. Validation passed: lint; 104 tests; production build; 9 E2E tests; production audit with 0 vulnerabilities; Linux/amd64 image build; non-root runtime; `/config` writability; metadata persistence across restart; and graceful shutdown. IndexedDB remains authoritative for all inventory, SQLite stores infrastructure metadata only, and no inventory records moved to SQLite. Known limitations: inventory remains browser-local; `/config/stackmap.db` does not contain inventory; ARM64 is unvalidated; and `/config` must be writable by container UID/GID 10001.

### 2. Complete normalized SQLite schema and server repository

- **Status:** Complete
- **Branch:** `codex/sqlite-domain-repository`
- **Goal:** Implement the complete server-side inventory model without connecting the production UI.
- **Datastore authority after completion:** IndexedDB remains the sole authoritative production inventory datastore.
- **Scope:** Hosts, services, ports, paths, dependencies, metadata, revisions, referential integrity, ordering, migrations, transactions, and repository operations.
- **Explicit exclusions:** Inventory HTTP routes, React repository changes, backup/restore, legacy migration, and cutover.
- **Acceptance criteria:** The full model round-trips with preserved IDs and timestamps, enforced relationships, deterministic ordering, optimistic concurrency primitives, and transactional rollback.
- **Required tests:** Forward migration, constraints, rollback, repository CRUD, relationships, ordering, revisions, concurrency, and compatibility fixtures, plus standard validation.
- **Dependencies:** Task 1 Complete; its native and container validation passed.
- **Completion notes:** Implemented on `codex/sqlite-domain-repository` in commits `1a0f06980730f6f165d52a98bd6e6234e176dc5d` and `d43bf71df39fd46fac7fce054cb316b5f6f63013` (final head). Entire checkpoints: `0f0777474227` and `2bc875f94cb6`. PR #3 merged as `872962613207c7d4d913aa13a783935ea15fec6b`. Validation passed: lint; 116 tests; production build; 9 E2E tests; production audit with 0 vulnerabilities; `git diff --check`; GitHub Actions container validation; and the Task 2 schema smoke validation. IndexedDB remains authoritative for all production inventory; SQLite now contains the complete normalized server-side schema and repository, but no API or frontend cutover occurred and no production inventory source changed. Known limitations: SQLite inventory is not exposed through HTTP; the production UI and JSON backup/restore remain browser-side; cross-browser and multi-device sharing and legacy IndexedDB migration are not implemented; and ARM64 remains unvalidated.

### 3. Complete inventory API

- **Status:** Complete
- **Branch:** `codex/inventory-api`
- **Goal:** Expose the complete inventory model before any frontend cutover.
- **Datastore authority after completion:** IndexedDB remains the sole authoritative production inventory datastore; the API is not used for normal UI persistence.
- **Scope:** Versioned operations for hosts, services, nested ports, nested paths, dependencies, deletion rules, validation, and optimistic concurrency.
- **Explicit exclusions:** Partial frontend migration, backup/restore, legacy migration, and Dexie removal.
- **Acceptance criteria:** The API supports every normal inventory operation atomically and preserves current validation and deletion semantics without moving only hosts or scalar service fields.
- **Required tests:** Routes, validation, nesting, referential integrity, deletion, concurrency, error handling, and complete-model integration tests, plus standard validation.
- **Dependencies:** Task 2 Complete.
- **Completion notes:** Implemented on `codex/inventory-api` in commits `16998f9a5fe3e71cb9fa83f0dccb0f812385cdd1` and `c54491620a84c19e78cf5b39dd1bead529d8c5a0` (final head). Entire checkpoints: `3efb48068159` and `c74d6fde2534`. PR #5 merged as `2431638c1ab7ec77c69d1609e207b8d605baf712`. Validation passed: lint; 127 tests; production build; 9 E2E tests; production audit with 0 vulnerabilities; `git diff --check`; GitHub Actions container validation; and exact-head workflow run 30865255752. Container and API validation confirmed the complete normalized inventory API under `/api/v1`, including host and service operations, nested ports, paths, dependencies, validation, safe errors, and optimistic concurrency. IndexedDB remains authoritative for all production inventory; SQLite contains the complete normalized inventory schema, repository, and API, but the React frontend does not use the API, no production cutover occurred, and no production inventory source changed. Known limitations: SQLite inventory is not visible in the production UI; browser and SQLite inventories are not synchronized; JSON backup and restore remain browser-side; legacy IndexedDB migration is not implemented; the API intentionally has no authentication or CORS; and ARM64 remains unvalidated.

### 4. HTTP repository and coordinated frontend cutover

- **Status:** Complete
- **Branch:** `codex/http-repository-cutover`
- **Goal:** Switch the entire normal application inventory source from Dexie to the server in one coordinated cutover.
- **Datastore authority after completion:** SQLite is authoritative for every normal inventory operation; Dexie is accessible only to the later explicit legacy migration.
- **Scope:** HTTP repository; coordinated host and complete nested-service cutover; Port Map, Path Map, search, filters, warnings, conflicts, failure handling, and concurrency behavior.
- **Explicit exclusions:** JSON backup changes, legacy migration execution, Dexie deletion, public demo, and release work.
- **Acceptance criteria:** Hosts, services, ports, paths, and dependencies switch together; normal use never reads or writes Dexie; all existing workflows remain functional; no production split-brain state exists.
- **Required tests:** Repository adapter, component, failure, concurrency, Port Map, Path Map, search, filter, and full cutover E2E coverage, plus standard validation.
- **Dependencies:** Task 3 Complete.
- **Completion notes:** Implemented on `codex/http-repository-cutover` in commits `7f5fa41c11fae273bd919f4d9bfa0e57201fdaac`, `62e13ec9085deb57c40f9286b2b88c4b49118198`, and `0111a539874e55d6ea3fdc8df6b687f1ce1340dc` (final head). Entire checkpoints: `5f15fb6cf573`, `1799c92113b9`, and `f77cb1711e16`. PR #7 merged as `c050d9f26f07c7ac904dd256c5929a3b435518c3`. Validation passed: lint; 163 tests; production build; 10 E2E tests; production audit with 0 vulnerabilities; `git diff --check`; exact-head workflow 30916458935; Linux/amd64 image, non-root/read-only runtime, writable `/config`, health, nested restart/recreation persistence, multi-browser consistency, concurrency, and legacy-data safety checks. SQLite is the sole authority for normal production inventory; the React frontend uses only HTTP for normal operations, IndexedDB is read-only and legacy-only, and no normal Dexie read/write, dual write, fallback, synchronization, or split-brain path remains. Known limitations: legacy migration and server restore are not implemented, Dexie remains for the legacy boundary, authentication/CORS/accounts are absent, and ARM64 is unvalidated.

### 5. Server-authoritative JSON backup and restore

- **Status:** Ready
- **Branch:** `codex/server-backup-restore`
- **Goal:** Implement safe, complete, server-authoritative JSON export and atomic restore for the SQLite inventory without using IndexedDB as an active inventory source.
- **Datastore authority after completion:** SQLite remains authoritative; JSON is a portable transfer and backup format.
- **Scope:** Versioned, exact-shape server backup schema and metadata; complete hosts, services, ordered ports, ordered paths, dependencies, stable IDs/timestamps, revision and installation-metadata policy; validation before replacement; duplicate-ID, referential-integrity, nested-record, dependency, and schema-version validation; safe export/restore API and UI; explicit destructive confirmation; atomic full-model replacement with rollback; accessible progress/results; multi-browser and container persistence validation.
- **Explicit exclusions:** Legacy IndexedDB migration or automatic import; legacy deletion; Dexie removal; authentication; CORS; accounts; scheduled, cloud, or incremental backups; partial or merge restore; Task 6; public demo; unrelated features.
- **Acceptance criteria:** Server export contains the complete SQLite-authoritative inventory and preserves supported identities, timestamps, ordering, nested data, references, and metadata. Restore validates the whole backup before mutation, rejects malformed, duplicate, invalid-reference, invalid-nested, or incompatible data, migrates supported older versions without mutating input, and replaces hosts, services, ports, paths, and dependencies in one transaction. Validation or write failure leaves the exact existing inventory untouched; success returns a coherent new inventory revision visible across browsers and durable across restart/recreation. No IndexedDB write or restore fallback occurs, and legacy data remains untouched.
- **Required tests:** Fresh and nonempty complete exports; valid, malformed, duplicate-ID, invalid-reference, invalid-nested, future-version, and supported-legacy-version restores; transactional rollback; inventory revision; confirmation and accessibility; two-browser visibility; restart/recreation; no IndexedDB writes; legacy-data preservation; standard validation and Docker checks.
- **Dependencies:** Task 4 Complete.
- **Completion notes:** Ready after Task 4 completed and merged. Task 4 satisfies this task's dependency, SQLite is authoritative, and no unresolved blocker prevents server-authoritative backup and atomic restore work. Task 5 is not In Progress.

### 6. Opt-in legacy IndexedDB migration

- **Status:** Blocked
- **Branch:** `codex/indexeddb-migration`
- **Goal:** Copy legacy browser inventory into SQLite only with explicit user consent.
- **Datastore authority after completion:** SQLite remains authoritative; IndexedDB is a read-only migration source and is never silently deleted.
- **Scope:** Detection, preview, consent, empty-server default, destructive confirmation for populated servers, idempotency, retry, and user-facing results.
- **Explicit exclusions:** Silent migration, IndexedDB deletion, normal Dexie persistence, and unrelated UI changes.
- **Acceptance criteria:** Nothing migrates without consent; existing server data is protected; IDs and timestamps are preserved; failures leave both stores intact.
- **Required tests:** Empty and populated server, consent, cancellation, retry, rollback, compatibility, component, and E2E coverage, plus standard validation.
- **Dependencies:** Task 5 Complete.
- **Completion notes:** Pending.

### 7. Remove IndexedDB from normal persistence paths

- **Status:** Blocked
- **Branch:** `codex/remove-primary-indexeddb`
- **Goal:** Verify and enforce that Dexie is isolated to the explicit migration boundary.
- **Datastore authority after completion:** SQLite remains the sole normal inventory datastore.
- **Scope:** Remove obsolete normal Dexie repository paths and dependencies while retaining the approved migration reader.
- **Explicit exclusions:** Deleting browser data, unrelated refactors, public demo, and release work.
- **Acceptance criteria:** No normal workflow reads or writes IndexedDB, while explicit migration remains safe and testable.
- **Required tests:** Dependency checks, repository and component suites, migration regression, full E2E, and production build.
- **Dependencies:** Task 6 Complete.
- **Completion notes:** Pending.

### 8. Deployment, backup, and upgrade validation

- **Status:** Blocked
- **Branch:** `codex/sqlite-deployment-validation`
- **Goal:** Validate durable production behavior and failure handling end to end.
- **Datastore authority after completion:** SQLite remains authoritative and its operational guarantees are validated.
- **Scope:** Container restart and recreation; `/config` persistence; multi-browser shared data; database migrations; failed upgrades; cold backup and restore; unwritable volume behavior; graceful shutdown; Portainer-relevant deployment checks.
- **Explicit exclusions:** New product features, live backup automation, cloud provisioning, and release publication.
- **Acceptance criteria:** Production-like scenarios pass without data loss; permission and upgrade failures fail closed and are diagnosable; backup and rollback limits are explicit.
- **Required tests:** Full lint, unit, build, and E2E suite plus Docker recreation, migration, restore, concurrency, permissions, health, shutdown, and smoke validation.
- **Dependencies:** Task 7 Complete.
- **Completion notes:** Pending.

### 9. Public demo mode

- **Status:** Blocked
- **Branch:** `codex/public-demo-mode`
- **Goal:** Provide a clearly separated Cloudflare Pages demo without production persistence.
- **Datastore authority after completion:** The demo uses only an in-memory repository; the self-hosted product remains SQLite-authoritative.
- **Scope:** Preloaded realistic sample homelab; temporary session-only edits; reset on refresh; clear demo banner; Cloudflare Pages build; no user-data upload by default.
- **Explicit exclusions:** IndexedDB, server API, persistent demo data, user accounts, and changes to production persistence.
- **Acceptance criteria:** The demo starts with sample data, clearly identifies demo mode, discards changes on refresh, and neither reads nor writes IndexedDB or the production API.
- **Required tests:** Repository-isolation, sample-data, banner, reset, no-persistence, build, and focused E2E coverage.
- **Dependencies:** Task 8 Complete and approval of the public demo behavior.
- **Completion notes:** Pending.

### 10. Documentation and SQLite release preparation

- **Status:** Blocked
- **Branch:** `codex/sqlite-release-preparation`
- **Goal:** Align public deployment, migration, backup, upgrade, release, and limitation documentation with validated behavior.
- **Datastore authority after completion:** SQLite remains the documented production authority; demo memory and legacy migration boundaries are explicit.
- **Scope:** README, architecture, decisions, deployment, migration, backup/restore, upgrade, demo, release checklist, and release notes.
- **Explicit exclusions:** Product features, infrastructure provisioning, merging, tagging, and publication unless separately approved.
- **Acceptance criteria:** Documentation matches implemented and validated behavior without stale frontend-only or split-authority claims.
- **Required tests:** Link and command review, full application validation, and applicable Docker and demo smoke checks.
- **Dependencies:** Task 9 Complete, or an explicit decision to release without the optional demo.
- **Completion notes:** Pending.

## Defaults and open decisions

- Use integer revisions for optimistic concurrency.
- Migrate legacy data into an empty server by default and require additional destructive confirmation for a populated server.
- Begin with a 10 MiB JSON import limit.
- Initially document cold `/config` backup and defer live SQLite-aware automation.
- Migrate database schemas forward only; image rollback may require a matching database backup.
- ARM64 support remains blocked until native dependency validation is explicitly approved and completed.

## Completion and advancement rules

- Only one task may be In Progress.
- A task becomes Complete only after implementation, review, merge, and synchronization of `main`.
- Completion does not automatically make the next task Ready. Failed validation or an unresolved technical or product decision leaves it Blocked.
- Plan advancement occurs in a separate feature branch and pull request, never as a direct post-merge commit to `main`.
- A task may be split deliberately into smaller branches when safe implementation or review requires it; update the plan before beginning those branches.
- Each completion entry records the implementation commit, merge commit, Entire checkpoint, validation summary, known limitations, datastore authority, and the Ready-or-Blocked decision for the next task.

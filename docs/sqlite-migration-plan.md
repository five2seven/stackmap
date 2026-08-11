# SQLite Migration Plan

## Target architecture and authority

StackMap will retain React, TypeScript, and Vite and add a Node.js 24 LTS TypeScript server using Fastify 5, better-sqlite3, and plain SQL migrations. One non-root process will serve the compiled frontend and a same-origin `/api/v1` API from a self-hosted container. SQLite will live at `/config/stackmap.db` on a durable bind mount.

The current implementation remains authoritative for implemented behavior. IndexedDB remains the sole authoritative inventory datastore through Tasks 1 to 3. Task 4 performs one coordinated cutover of the complete inventory model to SQLite. From Task 4 onward, SQLite is authoritative for all normal inventory operations; IndexedDB is retained only at the explicit legacy-migration boundary. No phase may split normal inventory authority between the two stores.

JSON export remains supported. Legacy migration is opt-in and data-safe. Database migrations and replacements are transactional and fail closed, and IDs and timestamps are preserved.

## Phased backlog

Tasks 1 through 8 are Complete, and Task 9 is Ready after explicit approval of the proposed public demo behavior on 2026-08-11. Task 10 remains Blocked by its listed dependency or an explicit decision to release without the optional demo.

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

- **Status:** Complete
- **Branch:** `codex/server-backup-restore`
- **Goal:** Implement safe, complete, server-authoritative JSON export and atomic restore for the SQLite inventory without using IndexedDB as an active inventory source.
- **Datastore authority after completion:** SQLite remains authoritative; JSON is a portable transfer and backup format.
- **Scope:** Versioned, exact-shape server backup schema and metadata; complete hosts, services, ordered ports, ordered paths, dependencies, stable IDs/timestamps, revision and installation-metadata policy; validation before replacement; duplicate-ID, referential-integrity, nested-record, dependency, and schema-version validation; safe export/restore API and UI; explicit destructive confirmation; atomic full-model replacement with rollback; accessible progress/results; multi-browser and container persistence validation.
- **Explicit exclusions:** Legacy IndexedDB migration or automatic import; legacy deletion; Dexie removal; authentication; CORS; accounts; scheduled, cloud, or incremental backups; partial or merge restore; Task 6; public demo; unrelated features.
- **Acceptance criteria:** Server export contains the complete SQLite-authoritative inventory and preserves supported identities, timestamps, ordering, nested data, references, and metadata. Restore validates the whole backup before mutation, rejects malformed, duplicate, invalid-reference, invalid-nested, or incompatible data, migrates supported older versions without mutating input, and replaces hosts, services, ports, paths, and dependencies in one transaction. Validation or write failure leaves the exact existing inventory untouched; success returns a coherent new inventory revision visible across browsers and durable across restart/recreation. No IndexedDB write or restore fallback occurs, and legacy data remains untouched.
- **Required tests:** Fresh and nonempty complete exports; valid, malformed, duplicate-ID, invalid-reference, invalid-nested, future-version, and supported-legacy-version restores; transactional rollback; inventory revision; confirmation and accessibility; two-browser visibility; restart/recreation; no IndexedDB writes; legacy-data preservation; standard validation and Docker checks.
- **Dependencies:** Task 4 Complete.
- **Completion notes:** Implemented on `codex/server-backup-restore` in commits `36a8935485b0d8616036a7abcb3b4f18bd4f6756` and `7dc5904807c49d4df08c95f7b29b00ef04d9d210` (final head). Entire checkpoints: `9917acfd0842` and `e2dc50328819`. PR #9 merged as `d1b7218e440386c992ecc7dc1e9628f5af85389a`. Validation passed: lint; 180 unit/integration tests; production build; 11 browser E2E tests; production audit with zero vulnerabilities; `git diff --check`; exact-head GitHub Actions run 30941581675; and container export, preview, atomic restore, revision, target metadata, nested persistence, restart, and recreation checks. SQLite remains the sole production-authoritative datastore; server backup and restore are complete and operate only through SQLite and the server API; legacy IndexedDB remains read-only and isolated. Known limitations: only server backup schema version 1 is supported; restore is manual and destructive; scheduled, cloud, incremental, partial, and merge backup/restore are not implemented; legacy migration awaits Task 6; ARM64 remains unvalidated.

### 6. Opt-in legacy IndexedDB migration

- **Status:** Complete
- **Branch:** `codex/indexeddb-migration`
- **Goal:** Import legacy browser inventory into SQLite only with explicit user consent and remove Dexie from normal application paths while preserving the read-only migration boundary.
- **Datastore authority after completion:** SQLite remains authoritative; IndexedDB is a read-only migration source and is never silently deleted.
- **Scope:** Exact-shape, read-only legacy schema-v3 detection and validation; complete hosts, services, ordered ports, paths, dependencies, IDs, timestamps, enums, and references; empty-target-only preview and import; explicit consent and acknowledgement; deterministic legacy fingerprint; bounded single-use preview token and expected-revision concurrency guards; one atomic SQLite transaction; record revision reset to 1; one global revision increment; atomic server-side migration receipt; safe repeat-startup behavior; removal of Dexie from normal application paths while retaining the read-only migration boundary. The detailed safety contract is authoritative in `docs/current-task.md`.
- **Explicit exclusions:** Populated-target replacement, merge, append, or partial import; destructive restore reuse; silent or automatic migration; IndexedDB deletion or marker writes; client-side suppression state; normal Dexie persistence; dual write, fallback, synchronization, automatic retry, arbitrary historic-format conversion, and unrelated UI changes.
- **Acceptance criteria:** Only exact-shape schema version 3 migrates, and only into empty SQLite. Preview is non-mutating; confirmation requires consent, acknowledgement, an exact-dataset token, and expected revision. Complete import and receipt creation are atomic; IDs/timestamps are preserved; imported record revisions start at 1; the global revision advances once. Every failed, cancelled, stale, duplicate, concurrent, or overflow path leaves both stores unchanged. A matching receipt prevents repeat blocking, changed legacy data fails closed, normal paths no longer use Dexie, IndexedDB remains untouched, and Task 5 backup/restore remains intact.
- **Required tests:** Complete schema-v3 shape/enums/references/nested identity and immutable reads; unsupported versions and malformed/unknown fields; empty and populated targets; safe target-not-empty response; consent and acknowledgement; expected-revision, fingerprint, token expiry/reuse/mismatch, stale source/target, simultaneous and duplicate confirmations, uncertain retry; staged transaction rollback and overflow; receipt creation/rollback and matching/changed/missing/failing lookup startup; no IndexedDB writes or local suppression; Task 5 regression; component, browser E2E, applicable container, and standard validation.
- **Dependencies:** Task 5 Complete.
- **Completion notes:** Implemented on `codex/indexeddb-migration` in commits `b50046496b2c577abf5638a4b351b9b006573018`, `95f17fac9faa39025c48f2a1f430f07260902582`, `044cfd1a6c05ebe015fb9cb9d0910ef811524dcc`, and `d431b6145fbe61b2406b7d88714eadfbfc94e926` (final head). Entire checkpoints: `76f09cdbb3db`, `aff0ab58da32`, `0e00b1c79cef`, and `b60c95606231`. PR #11 merged as `26c1447701ba598f9f5928414fd8c2fbc33a5540`. Validation passed: lint; 230 unit/integration/component tests; production build; 11 browser E2E tests; production audit with zero vulnerabilities; `git diff --check`; exact-head GitHub Actions run 30959183764; Linux/amd64 image build; and container migration, schema, receipt, restart, and recreation checks. SQLite remains the sole production-authoritative inventory datastore; normal application persistence uses only HTTP and SQLite, while legacy IndexedDB remains an isolated read-only migration source and is never silently changed or deleted. Known limitations: migration supports only exact legacy schema version 3, is manual, and requires an empty SQLite target; no merge, append, partial import, overwrite, automatic migration, or automatic retry is supported; the legacy compatibility reader and Dexie dependency remain until Task 7; authentication, CORS, accounts, telemetry, external persistence, and ARM64 validation remain absent. Task 7 is Ready; Tasks 8–10 remain Blocked by their listed dependencies.

### 7. Remove IndexedDB from normal persistence paths

- **Status:** Complete
- **Branch:** `codex/remove-primary-indexeddb`
- **Goal:** Retire remaining legacy-only compatibility code after the approved migration boundary is no longer required.
- **Datastore authority after completion:** SQLite remains the sole inventory datastore and IndexedDB access is fully retired.
- **Scope:** Remove the Dexie dependency only when no migration boundary requires it; remove obsolete legacy readers, adapters, and tests; verify no IndexedDB access remains anywhere; and clean up documentation associated with complete legacy retirement. Task 6 already removes Dexie from normal application paths.
- **Explicit exclusions:** Deleting browser data, unrelated refactors, public demo, and release work.
- **Acceptance criteria:** No normal workflow reads or writes IndexedDB, while explicit migration remains safe and testable.
- **Required tests:** Dependency checks, repository and component suites, migration regression, full E2E, and production build.
- **Dependencies:** Task 6 Complete.
- **Completion notes:** Implemented on `codex/remove-primary-indexeddb` in commits `9bdf2efd7fbff5ac9ac5d59eefa8127096713af7`, `076f7de4ba5e309e8082e75cea44bb47031b8508`, `c646b767a8f21f802ef2034a3c65b1e374aaf868`, and `43f714cc7e96041363e7f8023efdfa8eb104a042` (final head). Entire checkpoints: `06b46c95c7d8`, `89af69597d5b`, `226db6577228`, and `519eabad1c4a`. PR #13 merged as `de336ac09fac3cb4976d6d7425e327ac8fb66dc9`. Validation passed: lint; 162 unit/integration/component tests; production build; 11 browser E2E tests; production audit with zero vulnerabilities; `git diff --check`; exact-head GitHub Actions run 31337842065; Semgrep; Linux/amd64 image build; and container schema, retired-API, receipt, backup/restore, restart, and recreation checks. SQLite is the sole production-authoritative inventory datastore; normal application persistence uses only HTTP and SQLite; all IndexedDB and Dexie application access and the legacy migration UI/API are retired without reading, modifying, or deleting browser data. Existing Task 6 migrated inventory and receipt-bearing databases remain compatible, and Task 5 backup/restore and JSON import compatibility remain intact. Known limitations: current releases cannot migrate browser-local data that was not migrated before retirement, so recovery requires a compatible older release or existing JSON export; browser data remains untouched; server restore supports only backup schema version 1 and remains manual and destructive; authentication, CORS, accounts, telemetry, external persistence, and ARM64 validation remain absent. Task 8 is Ready because Task 7 is Complete with exact-head application and container validation and no unresolved dependency; Tasks 9–10 remain Blocked by their listed dependencies.

### 8. Deployment, backup, and upgrade validation

- **Status:** Complete
- **Branch:** `codex/sqlite-deployment-validation`
- **Goal:** Validate durable production behavior and failure handling end to end.
- **Datastore authority after completion:** SQLite remains authoritative and its operational guarantees are validated.
- **Scope:** Container restart and recreation; `/config` persistence; multi-browser shared data; database migrations; failed upgrades; cold backup and restore; unwritable volume behavior; graceful shutdown; Portainer-relevant deployment checks.
- **Explicit exclusions:** New product features, live backup automation, cloud provisioning, and release publication.
- **Acceptance criteria:** Production-like scenarios pass without data loss; permission and upgrade failures fail closed and are diagnosable; backup and rollback limits are explicit.
- **Required tests:** Full lint, unit, build, and E2E suite plus Docker recreation, migration, restore, concurrency, permissions, health, shutdown, and smoke validation.
- **Dependencies:** Task 7 Complete.
- **Completion notes:** Implemented on `codex/sqlite-deployment-validation` in commits `bc829d32ada706c79e31598646f92a54231bd2d3`, `3ce9b8a8afa0a0f4462d45d2c6ce6b0f1e6e6990`, `425a06178f2be3f42ea102147851805f72893267`, and `1235b832b6ed2f22623b90eb885134bde9b57b99` (final head). Entire checkpoints: `98fe29af9f4d`, `ebefeddc2042`, `87e90a089282`, and `a8e4b9865c78`. PR #15 merged as `fe921dd77c7405d69ce02634f21745210b9b8466`. Validation passed: lint; 162 unit/integration/component tests; production build; 11 browser E2E tests; production audit with zero vulnerabilities; `git diff --check`; exact-head GitHub Actions run 31339564793; Semgrep; Linux/amd64 image build; and container schema, retired-API, receipt, Task 5 backup/restore, restart, recreation, forward migration, concurrent-client conflict, cold `/config` backup/restore, unsupported-schema, unwritable-volume, health, graceful-shutdown, and Portainer/Compose contract checks. SQLite remains the sole production-authoritative inventory datastore; normal application persistence uses only the same-origin HTTP API and SQLite; IndexedDB and legacy migration paths remain retired and browser data remains untouched. Known limitations: cold backup requires a cleanly stopped container and the complete `/config` directory; live SQLite-file copying and live backup automation remain unsupported; database migrations are forward-only; image rollback requires a compatible schema or matching cold backup; server restore supports only backup schema version 1 and remains manual and destructive; authentication, CORS, accounts, telemetry, external persistence, and ARM64 validation remain absent. Task 9 is Ready because Task 8 is Complete and the proposed public demo behavior was explicitly approved on 2026-08-11. Task 10 remains Blocked by its listed dependency or an explicit decision to release without the optional demo.

### 9. Public demo mode

- **Status:** Ready
- **Branch:** `codex/public-demo-mode`
- **Goal:** Provide a clearly separated Cloudflare Pages demo without production persistence.
- **Datastore authority after completion:** The demo uses only an in-memory repository; the self-hosted product remains SQLite-authoritative.
- **Scope:** Preloaded realistic sample homelab; temporary session-only edits; reset on refresh; clear demo banner; Cloudflare Pages build; no user-data upload by default.
- **Explicit exclusions:** IndexedDB, server API, persistent demo data, user accounts, and changes to production persistence.
- **Acceptance criteria:** The demo starts with sample data, clearly identifies demo mode, discards changes on refresh, and neither reads nor writes IndexedDB or the production API.
- **Required tests:** Repository-isolation, sample-data, banner, reset, no-persistence, build, and focused E2E coverage.
- **Dependencies:** Task 8 Complete and approval of the public demo behavior.
- **Completion notes:** Ready after Task 8 completed and the proposed public demo behavior was explicitly approved on 2026-08-11. Implementation remains limited to the planned Task 9 feature branch. Task 10 remains Blocked by its listed dependency or an explicit decision to release without the optional demo.

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
- Permit legacy migration only when SQLite contains no hosts or services. If either exists, preview fails closed with `LEGACY_MIGRATION_TARGET_NOT_EMPTY`, issues no token, mutates neither datastore, and does not increment the global inventory revision. Task 6 must not replace, merge, append to, partially import into, overwrite, or implicitly reuse Task 5 restore against a populated target; the user must first back up and intentionally clear or otherwise handle existing server inventory through a separate approved workflow.
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

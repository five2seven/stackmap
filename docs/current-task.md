# Current Migration Task

## Task 6: Opt-in legacy IndexedDB migration

- **Status:** Ready
- **Branch:** `codex/indexeddb-migration`
- **Dependency:** Task 5 — Complete
- **Goal:** Import legacy browser inventory into the SQLite-authoritative server only with explicit user consent, while removing Dexie from normal application paths and preserving the read-only legacy boundary needed for migration.

### Authority rules

- SQLite remains the sole production-authoritative inventory datastore.
- Server-authoritative JSON backup and atomic restore are complete.
- Legacy IndexedDB remains read-only and isolated from normal production inventory operations.
- Task 6 is responsible only for explicit legacy import/migration and removal of Dexie from normal application paths.
- No dual write, automatic import, silent deletion, fallback, synchronization, or merge behavior is permitted.

### Scope

- Detect and exact-shape validate only legacy browser schema version 3 without upgrading or mutating it.
- Preview the complete legacy model and explain that it will be copied only into an empty server inventory.
- Require explicit consent and acknowledgement before importing anything.
- Preserve validated IDs, timestamps, nested ordering, and references.
- Reject a populated SQLite target without mutation; Task 6 does not replace, merge, append to, partially modify, or implicitly restore over server inventory.
- Reuse Task 5's short-lived, opaque, single-use, bounded preview-token and expected-revision architecture.
- Import the complete model and record migration completion in one SQLite transaction.
- Make retry, conflict, completion, and subsequent-startup behavior safe and understandable.
- Remove Dexie from normal application paths while retaining only the read-only migration boundary required by this task.
- Add focused unit, integration, component, browser E2E, and container-relevant validation.

### Compatible legacy contract

- Support only the current legacy browser export/data contract with exact top-level keys `schemaVersion`, `exportedAt`, `hosts`, and `services`, where `schemaVersion` is exactly `3`. Reject unknown or missing fields, older or future versions, and arbitrary historic formats.
- Validate each host's exact `id`, `name`, `type`, `ipAddress`, `operatingSystem`, `notes`, `createdAt`, and `updatedAt` shape. Require globally unique nonblank IDs, nonblank names, current host enums, and canonical timestamps.
- Validate each service's exact `id`, `name`, `containerName`, `dockerImage`, `description`, `applicationUrl`, `status`, optional `hostId`, `internalUrl`, `ports`, `paths`, `network`, `exposure`, `dependencyIds`, `notes`, `createdAt`, and `updatedAt` shape. Require globally unique nonblank IDs, nonblank names, current enums, and canonical timestamps.
- Validate ports with exact `id`, optional `hostPort`, optional `containerPort`, `protocol`, and `description` fields. Require a nonblank ID unique within its service, at least one port value, safe integers from 1 through 65535, a current protocol enum, and preserved order.
- Validate paths with exact `id`, `hostPath`, `containerPath`, `purpose`, and `readOnly` fields. Require a nonblank ID unique within its service, Boolean `readOnly`, at least one nonblank path/purpose value, and preserved order.
- Require nonblank, unique dependency IDs per service; reject self-dependencies; require every dependency and optional `hostId` to reference a record in the same legacy dataset.
- Detection and preview are read-only. Do not mutate IndexedDB or parsed records, sort arrays in place, or rewrite IDs or timestamps. Conversion creates separate server-import records.

### Empty-target and error policy

- Migration is permitted only when SQLite contains no host or service records.
- Preview fails closed if either table is nonempty, issues no confirmation token, mutates neither datastore, and does not increment the global revision.
- Return HTTP conflict code `LEGACY_MIGRATION_TARGET_NOT_EMPTY` with a safe message and request ID. Explain that server inventory must first be backed up and intentionally cleared or restored through a separately approved workflow. Do not expose SQL, paths, IndexedDB contents, or internal details.
- Task 6 must not implement destructive replacement or reuse Task 5 restore as an implicit overwrite mechanism.

### Preview and concurrency policy

1. Read and validate the complete legacy dataset without mutation, calculate a deterministic fingerprint, verify the target is empty, and capture its global inventory revision.
2. Return a safe summary containing host, service, port, path, and dependency counts, legacy schema version, and export timestamp, plus the expected target revision and a short-lived opaque migration-preview token.
3. Tokens are cryptographically random, server-side, capacity-bounded, single-use, tied to the exact fingerprint and expected empty target/revision, and never logged or exposed in errors.
4. Confirmation requires the token, expected revision, and explicit acknowledgement. Recheck token validity, expiry, use, fingerprint, target revision, target emptiness, and the migration commit guard before mutation.
5. Any target mutation or legacy-source fingerprint change after preview requires a new preview and returns a safe `LEGACY_MIGRATION_PREVIEW_STALE` or `LEGACY_MIGRATION_PREVIEW_INVALID` conflict with request ID.
6. Serialize confirmation through an application guard and the SQLite transaction/revision check. At most one simultaneous confirmation succeeds; duplicate submission, consumed-token reuse, and uncertain-response retry cannot import twice.
7. Preview, cancellation, expiry, invalid/stale confirmation, capacity failure, and every competing path leave both datastores and the global revision unchanged. The UI does not retry automatically.

### Atomic migration and revision policy

1. Validate the complete schema-v3 dataset without mutation.
2. Verify the target inventory is empty and capture its revision.
3. Begin one SQLite transaction and recheck both expected revision and target emptiness.
4. Insert all hosts, then services, ports, paths, and dependencies in foreign-key-safe order.
5. Assign every imported host and service revision `1`; do not import source record revisions if legacy storage contains them.
6. Advance the target global inventory revision exactly once, failing closed on unsafe overflow.
7. Write the migration receipt defined below.
8. Commit only after every record, revision, and receipt write succeeds.

The migration is complete-model only: no partial, merge, incremental, fallback, or dual-write behavior. Any insertion, reference, revision, metadata, receipt, or other write failure rolls back the entire transaction. Failed or cancelled migration leaves SQLite and IndexedDB unchanged; success preserves validated IDs and timestamps exactly.

### Migration receipt and post-success behavior

- On success, atomically store server-side metadata containing the deterministic legacy-dataset fingerprint, `importedAt` timestamp, resulting inventory revision, and legacy schema version.
- The receipt is written in the import transaction, is removed by rollback, does not overwrite installation identity or database `created_at`, and is not exported as user inventory unless separately documented. It never makes IndexedDB authoritative.
- Startup reads the legacy dataset and computes the same fingerprint without mutation, then queries the server receipt. A matching receipt bypasses the blocking interstitial and proceeds with HTTP/SQLite inventory without writing IndexedDB.
- A changed fingerprint fails closed, explains that browser-local legacy data differs, and requires a new preview. An absent receipt shows the migration workflow; receipt lookup failure blocks safely with Retry.
- Refresh and new browser sessions use the server receipt and fingerprint, never `localStorage`, an IndexedDB marker, permanent client acknowledgement, or deletion.
- Success shows a clear message, exposes migrated server inventory, remains visible after refresh, leaves original legacy data untouched, and preserves Task 5 backup/restore behavior.

### Explicit exclusions

- Silent or automatic migration
- Legacy IndexedDB deletion
- Normal IndexedDB persistence
- Dual writes or synchronization
- Partial or merge import
- Authentication, CORS, accounts, telemetry, or external persistence
- Deployment validation, public demo, release preparation, or other Tasks 7–10 work
- Planning advancement beyond Task 6 readiness
- Destructive replacement of populated server inventory
- Automatic retry or client-side migration suppression state

### Acceptance criteria

- Nothing imports without explicit user consent.
- SQLite remains authoritative before, during, and after migration.
- Legacy IndexedDB is read-only and remains untouched.
- Existing server data is protected by a clear, fail-closed workflow.
- Only exact-shape legacy schema version 3 is supported.
- The target SQLite inventory must be empty; populated targets are rejected without a token, mutation, or revision increment.
- Preview is non-mutating and confirmation requires explicit consent, acknowledgement, a valid preview token, and the expected revision.
- Complete import and migration-receipt creation are atomic.
- Validated IDs and timestamps are preserved.
- Imported host and service revisions start at `1`, and the global revision advances exactly once.
- Failed or cancelled migration leaves both stores unchanged.
- Stale, invalid, duplicate, concurrent, and overflow paths leave both stores unchanged.
- Matching migrated data does not repeatedly block startup; changed data fails closed.
- Normal application paths do not use Dexie.
- Backup and restore behavior from Task 5 remains intact.
- All required validation passes.

### Required tests

- No legacy database; empty legacy database; valid exact-shape schema version 3; malformed, missing, or unknown fields; older/future versions
- Complete host, service, port, path, dependency, enum, timestamp, nested-identity, and referential-integrity validation
- Immutable detection/preview reads, preserved ordering, IDs, and timestamps, and separate conversion records
- Empty target accepted; populated target rejected with safe guidance, no token, no mutation, no revision increment, and unchanged IndexedDB
- Preview non-mutation; explicit consent and acknowledgement; expected-revision and fingerprint guards
- Stale target, target populated after preview, changed legacy source, expired/reused/mismatched token, simultaneous confirmations, duplicate submission, and uncertain-response retry
- Complete successful transaction; imported record revision `1`; one global revision increment; safe revision-overflow failure
- Rollback after host, service, port, path, dependency, revision, and receipt writes; unchanged SQLite, legacy data, and revision on every failure
- Receipt creation and rollback; matching-fingerprint startup; changed fingerprint; missing receipt; receipt lookup failure; refresh and new-session behavior
- No automatic import, dual write, fallback, merge, deletion, IndexedDB writes, local suppression, or Dexie access from normal paths
- Task 5 backup/restore regression, component coverage, browser E2E, and applicable container validation

### Task 5 completion record

- **Implementation branch:** `codex/server-backup-restore`
- **Implementation commits:** `36a8935485b0d8616036a7abcb3b4f18bd4f6756`, `7dc5904807c49d4df08c95f7b29b00ef04d9d210`
- **Final implementation head:** `7dc5904807c49d4df08c95f7b29b00ef04d9d210`
- **Entire checkpoints:** `9917acfd0842`, `e2dc50328819`
- **Pull request:** #9
- **Merge commit:** `d1b7218e440386c992ecc7dc1e9628f5af85389a`
- **Validation:** lint; 180 unit/integration tests; production build; 11 browser E2E tests; production audit with zero vulnerabilities; `git diff --check`; exact-head GitHub Actions run 30941581675; container export, preview, restore, revision, metadata, nested persistence, restart, and recreation checks.
- **Datastore authority:** SQLite is the sole production-authoritative datastore. Server backup and restore operate only through SQLite and the server API. Legacy IndexedDB remains read-only and isolated.
- **Known limitations:** Only server backup schema version 1 is supported. Restore is manual and destructive; scheduled, cloud, incremental, partial, and merge backup/restore are not implemented. Legacy browser-data migration remains unimplemented until Task 6. ARM64 remains unvalidated.

## Reusable operator prompts

### Implementation prompt

Implement only the active StackMap migration task in AGENTS.md and docs/current-task.md. Validate it, commit it, push its feature branch, and open a pull request into main. Do not merge or advance the plan.

### Review prompt

Review the completed feature branch or pull request against origin/main. Do not modify files during the initial review. Report Blocking, Important, Minor, and No issue findings, and merge only if the recommendation is Ready to merge. After merging, do not modify planning files directly on main or begin another implementation task.

### Fix prompt

Stay on the existing feature branch and fix only recorded review findings. Add focused regression tests, validate, commit, and push. Do not merge or advance the plan.

### Planning advancement prompt

Start from clean, synchronized main and create a separate planning branch named for the completed task. Update only the migration plan and current-task document as required. Record implementation and merge commits, Entire checkpoints, validation, limitations, datastore authority, and whether the next task is Ready or Blocked. Open a pull request; do not implement the next task.

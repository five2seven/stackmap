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

- Detect compatible legacy browser inventory without upgrading or mutating it.
- Preview the legacy records and explain the target-server impact.
- Require explicit consent before importing anything.
- Preserve validated IDs and timestamps.
- Protect populated SQLite inventory with explicit destructive confirmation or another approved fail-closed policy.
- Make retry and completion behavior safe and understandable.
- Remove Dexie from normal application paths while retaining only the read-only migration boundary required by this task.
- Add focused unit, integration, component, browser E2E, and container-relevant validation.

### Explicit exclusions

- Silent or automatic migration
- Legacy IndexedDB deletion
- Normal IndexedDB persistence
- Dual writes or synchronization
- Partial or merge import
- Authentication, CORS, accounts, telemetry, or external persistence
- Deployment validation, public demo, release preparation, or other Tasks 7–10 work
- Planning advancement beyond Task 6 readiness

### Acceptance criteria

- Nothing imports without explicit user consent.
- SQLite remains authoritative before, during, and after migration.
- Legacy IndexedDB is read-only and remains untouched.
- Existing server data is protected by a clear, fail-closed workflow.
- Validated IDs and timestamps are preserved.
- Failed or cancelled migration leaves both stores unchanged.
- Normal application paths do not use Dexie.
- Backup and restore behavior from Task 5 remains intact.
- All required validation passes.

### Required tests

- No legacy database and empty legacy database
- Compatible legacy records
- Unsupported or malformed legacy data
- Empty and populated SQLite targets
- Consent, cancellation, confirmation, retry, and failure behavior
- Exact ID and timestamp preservation
- Atomic rollback and unchanged legacy data
- No automatic import, dual write, fallback, merge, or deletion
- No Dexie access from normal application paths
- Backup/restore regression coverage
- Component, browser E2E, and applicable container validation

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

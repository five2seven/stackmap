# Current Migration Task

## Task 7: Remove IndexedDB from normal persistence paths

- **Status:** Ready
- **Branch:** `codex/remove-primary-indexeddb`
- **Dependency:** Task 6 — Complete
- **Goal:** Retire the remaining legacy-only compatibility code after the approved migration boundary is no longer required.

### Authority rules

- SQLite remains the sole production-authoritative inventory datastore.
- Normal application persistence continues to use only the same-origin HTTP API and SQLite.
- The remaining IndexedDB and Dexie code is confined to the read-only legacy migration compatibility boundary inherited from Task 6.
- Task 7 must not delete browser data or reintroduce automatic migration, dual writes, fallback, synchronization, or split authority.

### Scope

- Remove the Dexie dependency only when no migration boundary requires it.
- Remove obsolete legacy readers, adapters, and tests.
- Verify that no IndexedDB access remains anywhere.
- Clean up documentation associated with complete legacy retirement.
- Preserve all server-authoritative inventory, backup, restore, and migration safety behavior unless the approved retirement design explicitly supersedes the legacy boundary.

### Explicit exclusions

- Deleting browser data
- Unrelated refactors or product features
- Deployment validation, public demo, or release work from Tasks 8–10
- Authentication, CORS, accounts, telemetry, or external persistence
- Planning advancement beyond Task 7 readiness

### Acceptance criteria

- No normal workflow reads or writes IndexedDB.
- The remaining approved legacy compatibility boundary is retired without deleting browser data.
- SQLite remains the sole production-authoritative inventory datastore.
- Server backup and restore behavior remains intact.
- Task 6 migration safety and completed-data behavior are preserved or deliberately retired according to the approved Task 7 design.
- All required validation passes.

### Required tests

- Dependency checks proving Dexie is removed when no longer required
- Repository and component regression suites
- Legacy migration and retirement regression coverage
- Full browser E2E suite
- Production build and standard validation

### Task 6 completion record

- **Implementation branch:** `codex/indexeddb-migration`
- **Implementation commits:** `b50046496b2c577abf5638a4b351b9b006573018`, `95f17fac9faa39025c48f2a1f430f07260902582`, `044cfd1a6c05ebe015fb9cb9d0910ef811524dcc`, `d431b6145fbe61b2406b7d88714eadfbfc94e926`
- **Final implementation head:** `d431b6145fbe61b2406b7d88714eadfbfc94e926`
- **Entire checkpoints:** `76f09cdbb3db`, `aff0ab58da32`, `0e00b1c79cef`, `b60c95606231`
- **Pull request:** #11
- **Merge commit:** `26c1447701ba598f9f5928414fd8c2fbc33a5540`
- **Validation:** lint; 230 unit/integration/component tests; production build; 11 browser E2E tests; production audit with zero vulnerabilities; `git diff --check`; exact-head GitHub Actions run 30959183764; Linux/amd64 image build; container migration, schema, receipt, restart, and recreation checks.
- **Datastore authority:** SQLite is the sole production-authoritative inventory datastore. Normal application reads and writes use only HTTP and SQLite. Legacy IndexedDB remains an isolated read-only migration source pending Task 7 retirement and is never silently modified or deleted.
- **Known limitations:** Only exact legacy browser schema version 3 is supported. Migration is manual and requires an empty SQLite target; merge, append, partial import, overwrite, automatic migration, and automatic retry are not supported. The read-only legacy compatibility reader and Dexie dependency remain until Task 7. Authentication, CORS, accounts, telemetry, external persistence, and ARM64 validation remain absent.
- **Advancement decision:** Task 7 is Ready because Task 6 is Complete with required validation and no unresolved dependency. Tasks 8–10 remain Blocked by their listed dependencies.

## Reusable operator prompts

### Implementation prompt

Implement only the active StackMap migration task in AGENTS.md and docs/current-task.md. Validate it, commit it, push its feature branch, and open a pull request into main. Do not merge or advance the plan.

### Review prompt

Review the completed feature branch or pull request against origin/main. Do not modify files during the initial review. Report Blocking, Important, Minor, and No issue findings, and merge only if the recommendation is Ready to merge. After merging, do not modify planning files directly on main or begin another implementation task.

### Fix prompt

Stay on the existing feature branch and fix only recorded review findings. Add focused regression tests, validate, commit, and push. Do not merge or advance the plan.

### Planning advancement prompt

Start from clean, synchronized main and create a separate planning branch named for the completed task. Update only the migration plan and current-task document as required. Record implementation and merge commits, Entire checkpoints, validation, limitations, datastore authority, and whether the next task is Ready or Blocked. Open a pull request; do not implement the next task.

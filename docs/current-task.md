# Current Migration Task

## Task 5: Server-authoritative JSON backup and restore

- **Status:** Ready
- **Branch:** `codex/server-backup-restore`
- **Dependency:** Task 4 — Complete
- **Goal:** Implement safe, complete, server-authoritative JSON export and atomic restore for the SQLite inventory without using IndexedDB as an active inventory source.

### Authority rules

- SQLite remains the sole authoritative production inventory datastore.
- Export reads only from the server-authoritative SQLite inventory.
- Restore writes only to SQLite through the server.
- IndexedDB is not an active backup or restore source.
- Legacy browser export remains available only through the read-only legacy-data boundary until Task 6.
- No dual write or restore fallback to IndexedDB is permitted.

### Scope

- Versioned server backup schema and documented schema versioning
- Complete export of hosts, services, ordered ports, ordered paths, and dependencies
- Stable IDs and timestamps
- Revision strategy for restored data
- Installation metadata policy and backup metadata
- Validation before replacement and exact-shape validation
- Duplicate-ID, referential-integrity, port, path, and dependency validation
- Atomic full-dataset replacement with rollback on any validation or write failure
- Safe API routes for export and restore
- Backup download and restore upload through the production UI
- Safe user confirmation and a clear destructive-action warning before restore
- Accessible progress, success, and error states
- Container persistence and multi-browser visibility after restore
- Unit, integration, browser E2E, and container persistence coverage

### Restore safety boundary

- Fully validate the uploaded backup before any production inventory mutation.
- Replace hosts, services, ports, paths, and dependencies together in one transaction.
- Do not allow partial, incremental, or merge restore.
- Leave existing inventory untouched when validation fails or any database write fails.
- Roll back to the exact pre-restore inventory on transaction failure.
- Return a coherent new inventory revision after success.
- Show the user a clear summary before confirmation.
- Require explicit acknowledgement that current server inventory will be replaced.
- Prevent accidental restore activation.
- Keep API errors free of SQL, raw SQLite errors, stack traces, filesystem paths, secrets, and internal details.
- Make restored inventory visible to connected browsers after reload or refresh.

### Explicit exclusions

- Legacy IndexedDB migration
- Automatic browser-data import
- Deleting legacy IndexedDB data
- Dexie removal
- Authentication
- CORS
- User accounts
- Scheduled backups
- Cloud backup destinations
- Incremental backup
- Partial restore
- Merge restore
- Task 6 implementation
- Public demo mode
- Unrelated features

### Acceptance criteria

- Server export contains the complete authoritative inventory.
- Export preserves all IDs, timestamps, ports, paths, dependencies, ordering, and supported metadata.
- The backup schema is versioned and documented.
- Restore validates the entire backup before mutation.
- Invalid backups never change current inventory.
- Restore is atomic across the complete inventory model and preserves referential integrity.
- Duplicate IDs and invalid nested records are rejected.
- Incompatible future versions fail closed.
- Known older supported versions migrate safely without mutating the uploaded object.
- Successful restore is visible across browsers and survives container restart and recreation with the same `/config`.
- SQLite remains authoritative, no IndexedDB write occurs, and legacy IndexedDB remains untouched.
- All required tests pass.

### Required tests

- Valid current-version backups and complete nested export
- Malformed backups and incompatible future versions
- Duplicate host, service, port, path, and dependency IDs
- Invalid host and dependency references
- Invalid ports and paths
- Supported legacy backup versions that remain in contract
- Atomic rollback on validation and database-write failure
- Inventory revision after restore
- Safe confirmation, cancellation, progress, success, and error states
- Browser E2E restore and two-browser visibility
- Container restart and recreation after restore
- No IndexedDB writes and untouched legacy browser data

### Validation

Run:

- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:e2e`
- `npm audit --omit=dev`
- `git diff --check`

Docker and container validation is required because restore changes durable production data. Validate:

- Fresh and nonempty server exports
- Complete nested-model export
- Valid restore
- Malformed restore
- Duplicate IDs and invalid references
- Unsupported future versions and any retained supported older versions
- Atomic rollback and post-restore inventory revision
- Two-browser visibility
- Container restart and recreation with the same `/config` after restore
- No IndexedDB writes and untouched legacy data
- Safe confirmation and accessible success/error states

## Reusable operator prompts

### Implementation prompt

Implement only the active StackMap migration task in AGENTS.md and docs/current-task.md. Validate it, commit it, push its feature branch, and open a pull request into main. Do not merge or advance the plan.

### Review prompt

Review the completed feature branch or pull request against origin/main. Do not modify files during the initial review. Report Blocking, Important, Minor, and No issue findings, and merge only if the recommendation is Ready to merge. After merging, do not modify planning files directly on main or begin another implementation task.

### Fix prompt

Stay on the existing feature branch and fix only recorded review findings. Add focused regression tests, validate, commit, and push. Do not merge or advance the plan.

### Planning advancement prompt

Start from clean, synchronized main and create a separate planning branch named for the completed task, such as codex/advance-sqlite-plan-task-1. Update only the migration plan, current task, and release checklist as required. Record the implementation commit, merge commit, Entire checkpoint, validation, limitations, datastore authority, and whether the next task is Ready or Blocked. Open a pull request; do not implement the next task.

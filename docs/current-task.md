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
- Exact preservation of validated record IDs and timestamps
- Explicit record and global inventory revision policy
- Target installation identity preservation and exact-shape informational backup metadata
- Validation before replacement and exact-shape validation
- Duplicate-ID, referential-integrity, port, path, and dependency validation
- Atomic full-dataset replacement with rollback on any validation or write failure
- Safe API routes for export and restore
- Backup download and restore upload through the production UI
- Safe user confirmation and a clear destructive-action warning before restore
- Accessible progress, success, and error states
- Container persistence and multi-browser visibility after restore
- Unit, integration, browser E2E, and container persistence coverage

### Restore identity, revision, and metadata policy

- Preserve every restored host, service, port, path, and dependency ID exactly; preserve every record's `createdAt` and `updatedAt` exactly from the validated backup. Do not regenerate IDs or timestamps during restore, and reject invalid, duplicate, or conflicting IDs before mutation.
- Treat source record revisions as informational only and do not restore them. Every successfully restored host and service starts at revision `1`; ports, paths, and dependencies retain the existing model and receive no independent record revision.
- Capture the target installation's current global inventory revision during preview. A successful restore advances it exactly once to the pre-restore revision plus one. Validation failure, cancellation, stale confirmation, transaction failure, or concurrent restore conflict does not increment it. A source global inventory revision is informational only and is never copied into the target database.
- Preserve the target installation's current `installation_id` and the target database's current `created_at`; never restore or overwrite either from the backup.
- Do not restore schema migration records, SQLite pragmas, file paths, WAL state, or other infrastructure metadata. Source installation and infrastructure metadata is informational only and is ignored during replacement.
- Backup metadata is informational and non-authoritative. Its allowed exact shape consists of the backup schema version, `exportedAt`, source installation ID, source inventory revision, and application version when available. Reject unknown metadata fields.
- Backup metadata cannot affect restored record IDs or timestamps, target installation identity, target database creation time, schema migrations, or target global inventory revision. It never substitutes for validation of the actual inventory records.

### Preview, confirmation, and concurrency policy

1. The server validates the uploaded backup without mutating inventory.
2. A successful preview returns a safe restore summary, the current target inventory revision, and a short-lived opaque backup-specific validation token or equivalent server-side handle.
3. The UI presents the summary and destructive-action warning, then requires explicit confirmation.
4. Confirmation sends both the preview token or validation handle and the expected target inventory revision returned by preview.
5. Before mutation, the server verifies that the token is valid, matches the exact validated backup, has not expired or been used, the current inventory revision still equals the expected revision, and no other restore is committing.
6. If any guard fails, return a safe conflict without mutation or revision increment and require a new preview.

### Restore safety boundary

- Fully validate the uploaded backup before any production inventory mutation.
- Reject invalid, duplicate, or conflicting record IDs and preserve validated IDs and timestamps exactly.
- Treat source record revisions and the source global inventory revision as informational; initialize restored hosts and services at revision `1` and advance the target global inventory revision exactly once on success.
- Preserve the target `installation_id` and database `created_at`; ignore source migration, SQLite, filesystem, WAL, and other infrastructure metadata.
- Exact-shape validate informational backup metadata and reject unknown metadata without trusting metadata in place of inventory validation.
- Separate non-mutating preview from explicit confirmation and require a short-lived, opaque, single-use, backup-specific preview token plus the preview's expected target inventory revision.
- If any host, service, port, path, or dependency changes after preview, fail confirmation as stale rather than overwriting newer inventory; require a new preview.
- Serialize restore commits through the SQLite transaction boundary and an explicit restore-operation guard where needed. Two concurrent confirmations cannot both succeed.
- Reject duplicate submissions and timed-out retries idempotently after the first successful use so the same confirmation cannot restore twice.
- Check the expected inventory revision, replace hosts, services, ports, paths, and dependencies, and write the new global inventory revision in the same transaction.
- Do not allow partial, incremental, or merge restore.
- Leave existing inventory untouched when validation fails or any database write fails.
- On any transaction failure, roll back inventory records, child records, dependencies, record revisions, the global inventory revision, and token consumption state when it is transactionally stored.
- Return the pre-restore global inventory revision plus one after success; failed validation, cancellation, stale confirmation, transaction failure, and concurrency conflict do not increment it.
- Show the user a clear summary before confirmation.
- Require explicit acknowledgement that current server inventory will be replaced.
- Disable confirmation while submission is active and prevent repeated clicks from sending multiple confirmations.
- Cancellation, closing, or refreshing before confirmation leaves inventory unchanged.
- After a stale or invalid confirmation, preserve the selected file and summary when practical, disable confirmation, explain that a new preview is required, and never reuse the old token.
- Return distinct safe conflict codes such as `RESTORE_PREVIEW_STALE` for stale expected state and `RESTORE_PREVIEW_INVALID` for invalid, expired, reused, or mismatched previews.
- Include a request ID and safe message in API errors without exposing SQL, raw SQLite errors, stack traces, filesystem paths, secrets, preview-token contents, or internal details.
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
- Restore preserves validated record IDs and timestamps exactly, rejects invalid, duplicate, or conflicting IDs, and assigns revision `1` to restored hosts and services without importing source record revisions.
- Source record and global inventory revisions are informational only. Success advances the target global inventory revision exactly once to its pre-restore value plus one; every unsuccessful or cancelled path leaves it unchanged.
- Restore preserves the target `installation_id` and database `created_at`, and cannot import source migrations, pragmas, paths, WAL state, or other infrastructure metadata.
- Informational backup metadata has the defined exact shape, rejects unknown fields, cannot override authoritative target or record state, and cannot replace inventory validation.
- Preview is non-mutating and confirmation requires a valid, unexpired, unused, backup-specific opaque token and the expected target inventory revision.
- Inventory changes after preview produce a safe stale-preview conflict and require re-preview rather than overwriting newer changes.
- Concurrent restores serialize, at most one competing confirmation succeeds, and duplicate submissions or retries cannot apply a restore twice.
- Invalid backups never change current inventory.
- Restore is atomic across the complete inventory model and preserves referential integrity; the expected-revision check, replacement, and single global-revision increment share one transaction and fully roll back on failure.
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
- Exact ID and timestamp preservation, conflicting IDs, restored host and service revision `1`, and no independent nested-record revisions
- Informational source record/global revisions and target global revision incrementing exactly once only on success
- Target `installation_id` and database `created_at` preservation, with source migration and infrastructure metadata ignored
- Exact-shape informational backup metadata, unknown metadata rejection, and proof that metadata cannot override authoritative inventory or target state
- Invalid host and dependency references
- Invalid ports and paths
- Supported legacy backup versions that remain in contract
- Atomic rollback on validation and database-write failure, including records, children, dependencies, revisions, and transactional token state
- Non-mutating preview and confirmation requiring the backup-specific token and expected inventory revision
- Inventory change after preview and stale expected-revision conflicts
- Two concurrent restore confirmations, where no more than one succeeds
- Duplicate confirmation submission and timed-out confirmation retry without double restore
- Reused, expired, and different-backup preview tokens
- Failed confirmation and cancelled restore without a global inventory revision increment
- Successful restore incrementing the global inventory revision exactly once
- Safe conflict codes, request IDs, cancellation, progress, success, errors, disabled in-flight confirmation, and repeated-click protection
- Browser E2E restore, two-browser visibility, and two-browser stale-preview behavior
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

# Current Migration Task

## Task 2: Complete normalized SQLite schema and repository

- **Status:** Ready
- **Branch:** `codex/sqlite-domain-repository`
- **Dependency:** Task 1 — Complete
- **Goal:** Build the complete server-side SQLite inventory model and repository while the production React application remains fully IndexedDB-authoritative.

### Scope

- Hosts table
- Services table
- Service ports table
- Service paths table
- Service dependencies table
- Application metadata and revision support where needed
- Created and updated timestamps
- Stable IDs
- Ordering fields where required
- Lifecycle status
- Foreign keys
- Unique constraints
- Delete behavior
- Host deletion protection when referenced
- Service deletion behavior
- Dependency cleanup rules
- Transactional repository operations
- Optimistic concurrency using integer revisions
- Complete server-side repository methods
- SQLite schema migration from the Task 1 database
- Repository and migration tests
- Upgrade tests from the Task 1 schema
- Failure rollback tests
- Referential-integrity tests

### Datastore authority

IndexedDB remains authoritative for all production inventory during Task 2. SQLite gains the complete server-side inventory schema and repository, but the React UI does not use it yet. No split-brain production behavior is introduced because the new repository is not connected to the production UI.

### Explicit exclusions

- HTTP inventory API routes
- React HTTP repository
- Frontend persistence cutover
- Any production UI change
- JSON export or restore changes
- IndexedDB migration
- Dexie removal
- Public demo mode
- Authentication
- CORS
- Task 3 implementation
- New user-facing application features

### Acceptance criteria

- Task 1 databases migrate forward safely.
- All inventory tables and constraints are created transactionally.
- Existing Task 1 metadata remains intact.
- Repository CRUD preserves IDs and timestamps.
- Revision checks prevent stale writes.
- Invalid references are rejected.
- Host deletion is blocked when referenced.
- Service deletion applies the approved dependency and child-record cleanup behavior.
- Migration failures roll back without partial schema changes.
- Future or altered migrations still fail closed.
- The production UI remains unchanged and IndexedDB-authoritative.
- No API routes are added.
- All required tests pass.

### Validation

- Run `npm run lint`.
- Run `npm test`.
- Run `npm run build`.
- Run `npm audit --omit=dev`.
- Run `git diff --check`.
- Docker validation is required only if Task 2 changes production image behavior or native runtime behavior; otherwise the Task 1 container proof remains sufficient.
- E2E tests are required only if user-visible or production workflow behavior changes; Task 2 should normally remain server/repository-only.

## Reusable operator prompts

### Implementation prompt

Implement only the active StackMap migration task in AGENTS.md and docs/current-task.md. Validate it, commit it, push its feature branch, and open a pull request into main. Do not merge or advance the plan.

### Review prompt

Review the completed feature branch or pull request against origin/main. Do not modify files during the initial review. Report Blocking, Important, Minor, and No issue findings, and merge only if the recommendation is Ready to merge. After merging, do not modify planning files directly on main; stop and report the merge result.

### Fix prompt

Stay on the existing feature branch and fix only recorded review findings. Add focused regression tests, validate, commit, and push. Do not merge or advance the plan.

### Plan-advancement prompt

Start from clean, synchronized main and create a separate planning branch named for the completed task, such as codex/advance-sqlite-plan-task-1. Update only the migration plan, current task, and release checklist as required. Record the implementation commit, merge commit, Entire checkpoint, validation, limitations, datastore authority, and whether the next task is Ready or Blocked. Open a pull request; do not implement the next task.

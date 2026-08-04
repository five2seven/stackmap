# Current Migration Task

## Task 4: HTTP repository and coordinated frontend cutover

- **Status:** Ready
- **Branch:** `codex/http-repository-cutover`
- **Dependency:** Task 3 — Complete
- **Goal:** Replace the production React application’s IndexedDB inventory repository with the same-origin HTTP API in one coordinated, complete-model cutover so SQLite becomes the sole authoritative production inventory datastore.

### Critical cutover rule

- Hosts, services, ports, paths, and dependencies must cut over together.
- No partial host-only or service-only cutover is permitted.
- No production operation may write to both IndexedDB and SQLite.
- After the cutover, normal production inventory reads and writes use the HTTP API only.
- IndexedDB remains accessible only for a later explicit legacy migration task.
- The cutover must not silently discard existing browser data.

### Scope

- HTTP inventory repository implementation
- Typed API client
- Host list, get, create, update, and delete
- Service list, get, create, update, and delete
- Complete nested ports, paths, and dependencies
- Inventory revision propagation
- Expected-revision concurrency
- Safe API error handling
- Loading states
- Error states
- Retry or recovery behavior where appropriate
- Application startup against the HTTP repository
- Complete replacement of normal Dexie inventory reads and writes
- Services view
- Host management
- Port Map
- Path Map
- Search
- Filters
- Editing workflows
- JSON export behavior review
- Clear handling when legacy IndexedDB data exists
- Same-origin API usage
- Component tests
- Integration tests
- Browser E2E tests
- Multi-browser consistency validation
- Container restart persistence validation

### Legacy data safety boundary

Until Task 6 provides the explicit migration workflow, Task 4 must use this safe temporary behavior:

- Detect legacy IndexedDB inventory.
- Do not automatically import it.
- Do not delete or overwrite it.
- Clearly inform the user that browser-local legacy data exists and is not yet in the server database.
- Provide safe guidance to export the legacy JSON backup before continuing.
- Do not allow ambiguous simultaneous editing of legacy IndexedDB and SQLite inventories.
- Preserve IndexedDB untouched for the explicit opt-in migration task.
- Do not implement the full Task 6 migration workflow in Task 4.

### Explicit exclusions

- Automatic IndexedDB migration
- Deleting legacy IndexedDB data
- Server-authoritative JSON restore
- Full server backup/restore replacement
- Dexie package removal
- Public demo mode
- Authentication
- CORS
- User accounts
- Task 5 implementation
- Task 6 implementation
- New unrelated user-facing features

### Acceptance criteria

- The production React UI uses the HTTP API for all normal host and service operations.
- Hosts, services, ports, paths, and dependencies cut over together.
- No normal production inventory operation uses IndexedDB.
- No dual-write behavior exists.
- SQLite becomes the sole authoritative production inventory datastore.
- Port Map and Path Map continue working.
- Search and filters continue working.
- Editing workflows continue working.
- Stable IDs and timestamps are preserved through API operations.
- Optimistic concurrency conflicts are shown safely to the user.
- API failures do not silently lose edits.
- Loading and error states are accessible.
- Multiple browsers see the same server inventory.
- Container restart and recreation preserve inventory through `/config`.
- Legacy IndexedDB data is detected but not modified.
- The user is warned before relying on the empty or new server inventory when legacy data exists.
- No automatic migration occurs.
- Existing JSON export behavior is reviewed and either safely preserved for legacy data or clearly separated from server inventory.
- All required tests pass.

### Validation

Run:

- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:e2e`
- `npm audit --omit=dev`
- `git diff --check`

Docker and container validation is required because Task 4 changes production persistence behavior. Validate:

- Fresh install
- Existing Task 3 database
- Container restart
- Container recreation with the same `/config` volume
- Two independent browser contexts sharing inventory
- Legacy IndexedDB detection
- No dual writes
- No silent IndexedDB deletion
- Complete host and service workflows
- Port Map and Path Map
- JSON export behavior
- API failure handling
- Optimistic concurrency conflicts

## Reusable operator prompts

### Implementation prompt

Implement only the active StackMap migration task in AGENTS.md and docs/current-task.md. Validate it, commit it, push its feature branch, and open a pull request into main. Do not merge or advance the plan.

### Review prompt

Review the completed feature branch or pull request against origin/main. Do not modify files during the initial review. Report Blocking, Important, Minor, and No issue findings, and merge only if the recommendation is Ready to merge. After merging, do not modify planning files directly on main; stop and report the merge result.

### Fix prompt

Stay on the existing feature branch and fix only recorded review findings. Add focused regression tests, validate, commit, and push. Do not merge or advance the plan.

### Planning advancement prompt

Start from clean, synchronized main and create a separate planning branch named for the completed task, such as codex/advance-sqlite-plan-task-1. Update only the migration plan, current task, and release checklist as required. Record the implementation commit, merge commit, Entire checkpoint, validation, limitations, datastore authority, and whether the next task is Ready or Blocked. Open a pull request; do not implement the next task.

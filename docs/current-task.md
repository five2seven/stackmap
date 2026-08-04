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
- Explicitly separated legacy browser-data and server-inventory JSON exports
- Clear handling when legacy IndexedDB data exists
- Same-origin API usage
- Component tests
- Integration tests
- Browser E2E tests
- Multi-browser consistency validation
- Container restart persistence validation

### Legacy data safety boundary

Until Task 6 provides the explicit migration workflow, Task 4 must use this safe temporary behavior:

- At application startup, detect whether legacy IndexedDB contains any hosts or services.
- If no legacy inventory exists, proceed normally with the server-backed SQLite inventory.
- If legacy inventory exists, show a blocking legacy-data interstitial before the normal inventory UI becomes editable.
- The interstitial must clearly state that browser-local legacy data was found, that it is not yet stored in SQLite, that the current server inventory may be empty or different, that automatic migration is unavailable in Task 4, and that the legacy data will remain untouched.
- The interstitial must provide a clearly labeled **Export legacy browser data** action. This action reads only from legacy IndexedDB, preserves the existing browser-local JSON schema and behavior, does not read from SQLite, does not modify either datastore, and clearly identifies the action and downloaded file as a legacy browser-data backup.
- The interstitial must provide a separate, deliberate acknowledgement action to continue to the server-backed inventory without importing legacy data. Accidental dismissal must not enable editing.
- Until the user deliberately acknowledges and continues, block normal host and service editing and all normal Port Map and Path Map editing paths, and do not mutate the server inventory.
- Acknowledgement may be session-scoped for Task 4. Do not provide permanent suppression or a “do not show again” mechanism.
- After deliberate continuation, the normal application uses only the HTTP API, performs no IndexedDB writes, and leaves legacy IndexedDB untouched.
- After deliberate continuation, the normal export action exports only the current server-authoritative inventory returned by the HTTP API, does not read from IndexedDB, and is clearly labeled as exporting the current StackMap server inventory.
- The legacy browser export and server inventory export must use distinct visible text and accessible names, must identify their data source before download, and must never silently select a source.
- The server inventory export is not a full server backup/restore system; server-authoritative restore remains excluded until Task 5.
- Do not implement legacy migration, merge, import, deletion, or synchronization behavior. Preserve IndexedDB untouched for Task 6.

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
- Startup detection distinguishes an IndexedDB inventory containing hosts or services from one containing no legacy inventory.
- When legacy inventory exists, a blocking interstitial presents all required legacy/server distinctions before the normal inventory UI is editable.
- Normal host, service, Port Map, and Path Map editing and all server mutations remain blocked until a separate deliberate acknowledgement continues to the server-backed application.
- Accidental dismissal cannot acknowledge the warning; acknowledgement may be session-scoped but cannot be permanently suppressed in Task 4.
- After acknowledgement, normal inventory operations use only the HTTP API, perform no IndexedDB writes, and leave legacy IndexedDB unmodified.
- No automatic migration occurs.
- **Export legacy browser data** reads only legacy IndexedDB, preserves the browser-local JSON schema and behavior, clearly identifies the download as a legacy backup, and modifies neither datastore.
- The normal server inventory export reads only the HTTP repository, clearly identifies the download as the current StackMap server inventory, and modifies neither datastore.
- Legacy and server export actions have distinguishable visible text and accessible names, identify their source before download, and never silently select a datastore.
- Server-authoritative restore remains excluded until Task 5, and the full opt-in migration workflow remains excluded until Task 6.
- Tests prove that legacy export reads only IndexedDB, server export reads only the HTTP repository, neither export mutates data, and both actions are distinguishable by visible text and accessible name.
- Tests prove that server editing remains blocked and no API mutation occurs from the legacy interstitial before acknowledgement, then acknowledgement enables server-backed operation without writing to IndexedDB.
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

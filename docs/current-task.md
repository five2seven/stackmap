# Current Migration Task

## Task 1: API and SQLite foundation

- **Status:** Ready
- **Branch:** `codex/sqlite-foundation`
- **Dependency:** None
- **Goal:** Establish the smallest production-shaped Fastify and SQLite foundation that can later host StackMap repositories without migrating product data yet.

### Scope

- Minimal TypeScript Fastify server
- SQLite connection with a configurable database path
- Bootstrap migration framework and `schema_migrations` table
- `application_metadata` only if the foundation requires it
- SQLite pragmas
- `/health` endpoint
- `/api/v1/meta` endpoint
- Serving the built Vite frontend with an SPA fallback
- Graceful shutdown
- Development proxy or a documented local development arrangement
- Focused tests

### Explicit exclusions

- Hosts, services, ports, paths, and dependencies
- JSON backup changes
- IndexedDB migration
- Docker runtime conversion
- Removal of Dexie
- Authentication or CORS
- Release work

### Acceptance criteria

- The server starts with a configurable SQLite path and applies bootstrap migrations transactionally.
- SQLite enables WAL mode and foreign keys, and records applied migrations.
- Health and metadata endpoints return stable, tested responses under `/health` and `/api/v1/meta`.
- Production serves built Vite assets and falls back to the SPA for non-API routes.
- Shutdown closes HTTP and database resources cleanly.
- Existing frontend behavior and IndexedDB data remain unchanged.
- No domain tables or domain persistence behavior are introduced.

### Required validation

- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:e2e`
- `git diff --check`
- Focused server, migration, endpoint, static-serving, SPA-fallback, and shutdown tests
- Docker validation is not required because Docker runtime conversion is excluded.

### Required completion report

Record the implemented scope, explicit exclusions, files changed, architecture/schema and data-safety impact, migration behavior, every validation result, known limitations, implementation commit ID, Entire checkpoint ID, review status, and confirmation that no unrelated work was added.

### Tracking

- **Review status:** Not started
- **Implementation commit:** Pending
- **Entire checkpoint:** Pending
- **Merge commit:** Pending

## Reusable operator prompts

### Implementation prompt

Continue the active StackMap migration task defined in AGENTS.md and docs/current-task.md. Implement only that task, follow all Git, Entire, validation, documentation, commit, and push requirements, update the task records, and stop without merging or beginning the next task.

### Review prompt

Review the completed StackMap migration branch defined in docs/current-task.md against origin/main. Follow AGENTS.md, run all required validation, fix nothing during the initial review, report findings by severity, and merge only if the recommendation is Ready to merge. After a successful merge, update the migration plan and current task to the next unblocked task, commit and push those planning updates, then stop.

### Fix prompt

Fix only the review findings recorded for the active StackMap migration task in docs/current-task.md. Stay on the existing feature branch, add focused regression coverage, run all required validation, commit, push, update the task record, and stop without merging or beginning another task.

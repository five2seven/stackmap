# Current Migration Task

## Task 1: API, SQLite, and target-runtime proof

- **Status:** Ready
- **Branch:** `codex/sqlite-foundation`
- **Dependency:** None
- **Goal:** Prove the server, native SQLite dependency, and target Linux container before introducing inventory persistence.

### Scope

- Minimal TypeScript Fastify server
- SQLite connection through better-sqlite3
- Configurable database path with production default `/config/stackmap.db`
- Bootstrap migration framework and `schema_migrations`
- `application_metadata` only if needed
- SQLite pragmas
- `/health` and `/api/v1/meta`
- Built Vite static serving and SPA fallback
- Graceful shutdown and local development arrangement
- Windows native dependency validation
- Linux Docker image build, non-root runtime, and health check
- `/config` bind mount and database writability check
- Bootstrap metadata persistence after container restart
- Focused tests

### Datastore authority

IndexedDB remains the only authoritative inventory datastore throughout Task 1. SQLite contains infrastructure metadata only. No normal inventory record may be written to SQLite.

### Explicit exclusions

- Hosts or services tables
- Ports, paths, or dependencies
- Inventory API
- Frontend HTTP repository or production persistence cutover
- JSON backup changes
- IndexedDB migration or Dexie removal
- Public demo mode
- Authentication or CORS
- Release work

### Acceptance criteria and validation

- Server and database lifecycle, transactional bootstrap migrations, WAL, foreign keys, endpoints, static serving, fallback, and shutdown are tested.
- better-sqlite3 installs and runs on Windows and in the Linux production image.
- The non-root container can write `/config/stackmap.db`, reports healthy, and preserves bootstrap metadata across restart.
- Existing frontend behavior and IndexedDB data remain unchanged; SQLite contains no domain tables or inventory records.
- Run `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`, focused server tests, relevant Docker checks, and `git diff --check`.

### Required completion report

Record scope, exclusions, files changed, datastore authority, architecture/schema and data-safety impact, migration behavior, every validation result, known limitations, implementation commit, Entire checkpoint, review status, and confirmation that no unrelated work was added.

### Tracking

- **Review status:** Not started
- **Implementation commit:** Pending
- **Entire checkpoint:** Pending
- **Merge commit:** Pending

## Reusable operator prompts

### Implementation prompt

Implement only the active StackMap migration task in AGENTS.md and docs/current-task.md. Validate it, commit it, push its feature branch, and open a pull request into main. Do not merge or advance the plan.

### Review prompt

Review the completed feature branch or pull request against origin/main. Do not modify files during the initial review. Report Blocking, Important, Minor, and No issue findings, and merge only if the recommendation is Ready to merge. After merging, do not modify planning files directly on main; stop and report the merge result.

### Fix prompt

Stay on the existing feature branch and fix only recorded review findings. Add focused regression tests, validate, commit, and push. Do not merge or advance the plan.

### Plan-advancement prompt

Start from clean, synchronized main and create a separate planning branch named for the completed task, such as codex/advance-sqlite-plan-task-1. Update only the migration plan, current task, and release checklist as required. Record the implementation commit, merge commit, Entire checkpoint, validation, limitations, datastore authority, and whether the next task is Ready or Blocked. Open a pull request; do not implement the next task.

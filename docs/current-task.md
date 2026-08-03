# Current Migration Task

## Task 3: Complete inventory API

- **Status:** Ready
- **Branch:** `codex/inventory-api`
- **Dependency:** Task 2 — Complete
- **Goal:** Expose the complete SQLite inventory repository through a safe, versioned Fastify API while the production React application remains fully IndexedDB-authoritative.

### Scope

- Versioned API routes under `/api/v1`
- Host list, get, create, update, and delete operations
- Service list, get, create, update, and delete operations
- Complete nested ports
- Complete nested paths
- Complete dependencies
- Inventory revision metadata
- Optimistic concurrency through expected revision values
- Request validation
- Safe error mapping, including 404, 409, and validation responses
- Transactional repository integration
- Stable response contracts
- Deterministic ordering
- API tests
- Route-level integration tests
- Failure-path tests
- Concurrency tests
- Referential-integrity tests

### Datastore authority

IndexedDB remains authoritative for all production inventory during Task 3. The API operates against SQLite but is not used by the production React UI yet. No split-brain production behavior is introduced because the frontend remains entirely on IndexedDB until Task 4.

### Explicit exclusions

- React HTTP repository
- Frontend persistence cutover
- Production UI changes
- IndexedDB migration
- Dexie removal
- JSON backup or restore changes
- Public demo mode
- Authentication
- Cross-origin support
- User accounts
- Task 4 implementation
- New user-facing features

### Acceptance criteria

- All host and service repository operations are exposed through `/api/v1`.
- Nested ports, paths, and dependencies round-trip without loss.
- Request bodies and parameters are validated before repository mutation.
- Repository errors map to stable, safe HTTP responses.
- Stale revisions return conflict responses.
- Missing records return not-found responses.
- Invalid references return safe validation or conflict responses as appropriate.
- No raw SQLite errors, SQL, stack traces, filesystem paths, or secrets are exposed.
- Responses preserve stable IDs, timestamps, revisions, and deterministic ordering.
- Failed requests leave no partial writes.
- The production UI remains unchanged and IndexedDB-authoritative.
- No CORS is added.
- All required tests pass.

### Validation

- Run `npm run lint`.
- Run `npm test`.
- Run `npm run build`.
- Run `npm audit --omit=dev`.
- Run `git diff --check`.
- E2E tests are required only if user-visible production behavior changes; Task 3 should normally remain server/API-only.
- Docker validation is required if the API changes container runtime behavior, health behavior, or image startup behavior; otherwise the existing Task 2 container proof remains sufficient.

## Reusable operator prompts

### Implementation prompt

Implement only the active StackMap migration task in AGENTS.md and docs/current-task.md. Validate it, commit it, push its feature branch, and open a pull request into main. Do not merge or advance the plan.

### Review prompt

Review the completed feature branch or pull request against origin/main. Do not modify files during the initial review. Report Blocking, Important, Minor, and No issue findings, and merge only if the recommendation is Ready to merge. After merging, do not modify planning files directly on main; stop and report the merge result.

### Fix prompt

Stay on the existing feature branch and fix only recorded review findings. Add focused regression tests, validate, commit, and push. Do not merge or advance the plan.

### Plan-advancement prompt

Start from clean, synchronized main and create a separate planning branch named for the completed task, such as codex/advance-sqlite-plan-task-1. Update only the migration plan, current task, and release checklist as required. Record the implementation commit, merge commit, Entire checkpoint, validation, limitations, datastore authority, and whether the next task is Ready or Blocked. Open a pull request; do not implement the next task.

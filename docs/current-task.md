# Current Migration Task

## Task 8: Deployment, backup, and upgrade validation

- **Status:** Ready
- **Branch:** `codex/sqlite-deployment-validation`
- **Dependency:** Task 7 — Complete
- **Goal:** Validate durable production behavior and failure handling end to end.

### Authority rules

- SQLite remains the sole production-authoritative inventory datastore.
- Normal application persistence continues to use only the same-origin HTTP API and SQLite.
- IndexedDB and Dexie application access and the legacy migration UI/API remain retired.
- Task 8 must not delete or inspect browser data, reintroduce legacy migration, or create dual-write, fallback, synchronization, or split authority.

### Scope

- Validate container restart and recreation with the durable `/config` mount.
- Validate multi-browser shared inventory, database migrations, failed upgrades, cold backup and restore, unwritable-volume behavior, graceful shutdown, and Portainer-relevant deployment behavior.
- Document operational guarantees, failure diagnostics, backup boundaries, and rollback limits only where Task 8 validation changes or confirms current documented behavior.
- Preserve Task 5 server backup/restore, completed Task 6 migrated inventory and receipt compatibility, and Task 7 retirement behavior.

### Explicit exclusions

- New product features or live backup automation
- Cloud provisioning or release publication
- Public demo work from Task 9
- Release-preparation work from Task 10
- Authentication, CORS, accounts, telemetry, external persistence, or Docker socket access
- Planning advancement beyond Task 8 readiness

### Acceptance criteria

- Production-like restart, recreation, upgrade, backup, restore, and failure scenarios pass without data loss.
- Permission and upgrade failures fail closed and provide actionable diagnostics.
- `/config` persistence and backup and rollback limits are explicit and verified.
- SQLite remains the sole production-authoritative inventory datastore across browsers and container lifecycle events.
- Retired IndexedDB and legacy migration paths remain absent and browser data remains untouched.
- All required validation passes.

### Required tests

- Full lint, unit/integration/component, production build, and browser E2E suites
- Linux/amd64 production image build
- Container recreation, migration, restore, concurrency, permissions, health, shutdown, and smoke validation
- Production dependency audit and `git diff --check`

### Task 7 completion record

- **Implementation branch:** `codex/remove-primary-indexeddb`
- **Implementation commits:** `9bdf2efd7fbff5ac9ac5d59eefa8127096713af7`, `076f7de4ba5e309e8082e75cea44bb47031b8508`, `c646b767a8f21f802ef2034a3c65b1e374aaf868`, `43f714cc7e96041363e7f8023efdfa8eb104a042`
- **Final implementation head:** `43f714cc7e96041363e7f8023efdfa8eb104a042`
- **Entire checkpoints:** `06b46c95c7d8`, `89af69597d5b`, `226db6577228`, `519eabad1c4a`
- **Pull request:** #13
- **Merge commit:** `de336ac09fac3cb4976d6d7425e327ac8fb66dc9`
- **Validation:** lint; 162 unit/integration/component tests; production build; 11 browser E2E tests; production audit with zero vulnerabilities; `git diff --check`; exact-head GitHub Actions run 31337842065; Semgrep; Linux/amd64 image build; container schema, retired-API, receipt, backup/restore, restart, and recreation checks.
- **Datastore authority:** SQLite is the sole production-authoritative inventory datastore. Normal application reads and writes use only HTTP and SQLite. IndexedDB and Dexie application access and the legacy migration UI/API are retired without reading, modifying, or deleting browser data. Existing Task 6 migrated inventory and receipt-bearing databases remain compatible.
- **Known limitations:** Current releases cannot migrate browser-local data that was not migrated before retirement; recovery requires a compatible older release or an existing JSON export. Browser data remains untouched. Server restore supports only backup schema version 1 and remains manual and destructive. Authentication, CORS, accounts, telemetry, external persistence, and ARM64 validation remain absent.
- **Advancement decision:** Task 8 is Ready because Task 7 is Complete with required exact-head validation and no unresolved dependency. Tasks 9 and 10 remain Blocked by their listed dependencies.

## Reusable operator prompts

### Implementation prompt

Implement only the active StackMap migration task in AGENTS.md and docs/current-task.md. Validate it, commit it, push its feature branch, and open a pull request into main. Do not merge or advance the plan.

### Review prompt

Review the completed feature branch or pull request against origin/main. Do not modify files during the initial review. Report Blocking, Important, Minor, and No issue findings, and merge only if the recommendation is Ready to merge. After merging, do not modify planning files directly on main or begin another implementation task.

### Fix prompt

Stay on the existing feature branch and fix only recorded review findings. Add focused regression tests, validate, commit, and push. Do not merge or advance the plan.

### Planning advancement prompt

Start from clean, synchronized main and create a separate planning branch named for the completed task. Update only the migration plan and current-task document as required. Record implementation and merge commits, Entire checkpoints, validation, limitations, datastore authority, and whether the next task is Ready or Blocked. Open a pull request; do not implement the next task.

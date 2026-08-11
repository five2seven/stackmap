# Current Migration Task

## Task 10: Documentation and SQLite release preparation

- **Status:** Ready
- **Branch:** `codex/sqlite-release-preparation`
- **Dependencies:** Task 9 — Complete
- **Goal:** Align public deployment, migration, backup, upgrade, release, and limitation documentation with validated behavior.

### Authority rules

- SQLite remains the sole production-authoritative inventory datastore.
- The Cloudflare Pages demo remains isolated, in-memory, and session-only; it must not be described as the production application or as persistent storage.
- IndexedDB remains retired and untouched by the current application.
- Documentation must reflect validated implementation and deployment behavior without expanding product scope.

### Scope

- Align README, architecture, decisions, deployment, migration, backup/restore, upgrade, demo, release checklist, and release notes with the completed implementation.
- Document the self-hosted SQLite production authority and the separate in-memory public demo boundary.
- Verify public commands, links, limitations, and release-facing guidance against the repository and validated workflows.
- Run full application validation and applicable Docker and demo smoke checks.

### Explicit exclusions

- Product features or persistence changes
- Infrastructure provisioning
- Accounts, authentication, telemetry, external databases, or Docker socket access
- Merging, tagging, release publication, or changing release artifacts unless separately approved
- Planning advancement beyond Task 10

### Acceptance criteria

- Public and internal documentation matches implemented and validated behavior.
- Deployment, migration, backup/restore, upgrade, and demo instructions preserve the correct datastore boundaries.
- No stale frontend-only, IndexedDB-authoritative, split-authority, or persistent-demo claims remain.
- Commands and links are reviewed, and all required validation passes.

### Required tests

- Link and command review
- Full lint, unit/integration/component test, production build, and browser E2E validation
- Cloudflare Pages demo build, artifact safeguards, and focused demo E2E coverage
- Applicable Docker and production smoke validation
- `git diff --check`

### Task 9 completion record

- **Implementation branch:** `codex/public-demo-mode`
- **Implementation commit and final head:** `8b5041f7624f9c2ae8f1429803980c12f67972f4`
- **Entire checkpoint:** `ce876509e838`
- **Pull request:** #17
- **Merge commit:** `48a34ac6c0dc27cb73f15726ab8c687d89cd5bd4`
- **Validation:** lint; 166 unit/integration/component tests; production build; isolated Cloudflare Pages demo build and artifact safeguard scan; 11 production browser E2E tests; focused demo browser E2E coverage; `git diff --check`; exact-head GitHub Actions run 31495211283; Semgrep; Linux/amd64 image build; container smoke validation; and deployment, backup, upgrade, and failure-handling validation.
- **Datastore authority:** SQLite remains the sole production-authoritative inventory datastore through the same-origin HTTP API. The separate Cloudflare Pages demo statically selects only an in-memory repository with bundled sample data; edits last only for the current page session and reset on refresh. The demo does not use the production API, SQLite, IndexedDB, Web Storage, or user-data upload.
- **Known limitations:** Demo changes are intentionally temporary and cannot be recovered after refresh. The public demo is not the self-hosted product and provides no persistence, backup/restore, accounts, authentication, telemetry, or user-data upload. Existing production limitations remain: cold backup requires a cleanly stopped container and the complete `/config` directory; database migrations are forward-only; server restore supports only backup schema version 1 and remains manual and destructive; and ARM64 remains unvalidated.
- **Advancement decision:** Task 9 is Complete because its exact implementation head passed review and validation, PR #17 was merged normally, and `main` was synchronized. Task 10 is Ready because Task 9 is Complete and no unresolved technical or product decision blocks the documented release-preparation scope.

## Reusable operator prompts

### Implementation prompt

Implement only the active StackMap migration task in AGENTS.md and docs/current-task.md. Validate it, commit it, push its feature branch, and open a pull request into main. Do not merge or advance the plan.

### Review prompt

Review the completed feature branch or pull request against origin/main. Do not modify files during the initial review. Report Blocking, Important, Minor, and No issue findings, and merge only if the recommendation is Ready to merge. After merging, do not modify planning files directly on main or begin another implementation task.

### Fix prompt

Stay on the existing feature branch and fix only recorded review findings. Add focused regression tests, validate, commit, and push. Do not merge or advance the plan.

### Planning advancement prompt

Start from clean, synchronized main and create a separate planning branch named for the completed task. Update only the migration plan and current-task document as required. Record implementation and merge commits, Entire checkpoints, validation, limitations, datastore authority, and whether the next task is Ready or Blocked. Open a pull request; do not implement the next task.

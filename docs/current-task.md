# Current Migration Task

## Task 9: Public demo mode

- **Status:** Ready
- **Branch:** `codex/public-demo-mode`
- **Dependencies:** Task 8 — Complete; proposed public demo behavior — explicitly approved on 2026-08-11
- **Goal:** Provide a clearly separated Cloudflare Pages demo without production persistence.

### Authority rules

- The self-hosted production application remains SQLite-authoritative and is unchanged by Task 9.
- Any public demo must use only an in-memory repository with bundled sample data and session-only edits.
- The demo must not read or write IndexedDB, call the production API, upload user data by default, or introduce persistent demo storage.
- The public demo behavior described below is explicitly approved; implementation remains confined to Task 9 on its planned feature branch.

### Scope

- Preload a realistic sample homelab.
- Keep edits in memory for the current page session and reset them on refresh.
- Display a clear demo banner.
- Produce a Cloudflare Pages-compatible build isolated from self-hosted production persistence.
- Add focused repository-isolation, sample-data, banner, reset, no-persistence, build, and browser E2E coverage.

### Explicit exclusions

- IndexedDB or other browser persistence
- Production API or SQLite access from the demo
- Persistent demo data, accounts, authentication, telemetry, or user-data upload by default
- Changes to self-hosted production persistence
- Release-preparation work from Task 10
- Planning advancement beyond the recorded Task 9 decision

### Acceptance criteria

- The demo starts with bundled sample data and clearly identifies itself as a demo.
- Demo edits are session-only and reset on refresh.
- The demo neither reads nor writes IndexedDB or the production API.
- The self-hosted application remains SQLite-authoritative and behaviorally unchanged.
- All required validation passes.

### Required tests

- Repository isolation and bundled sample-data coverage
- Banner and refresh-reset behavior
- Proof of no IndexedDB, server API, or other persistent storage use
- Cloudflare Pages-compatible production build
- Focused browser E2E coverage and standard validation

### Task 8 completion record

- **Implementation branch:** `codex/sqlite-deployment-validation`
- **Implementation commits:** `bc829d32ada706c79e31598646f92a54231bd2d3`, `3ce9b8a8afa0a0f4462d45d2c6ce6b0f1e6e6990`, `425a06178f2be3f42ea102147851805f72893267`, `1235b832b6ed2f22623b90eb885134bde9b57b99`
- **Final implementation head:** `1235b832b6ed2f22623b90eb885134bde9b57b99`
- **Entire checkpoints:** `98fe29af9f4d`, `ebefeddc2042`, `87e90a089282`, `a8e4b9865c78`
- **Pull request:** #15
- **Merge commit:** `fe921dd77c7405d69ce02634f21745210b9b8466`
- **Validation:** lint; 162 unit/integration/component tests; production build; 11 browser E2E tests; production audit with zero vulnerabilities; `git diff --check`; exact-head GitHub Actions run 31339564793; Semgrep; Linux/amd64 image build; container schema, retired-API, receipt, Task 5 backup/restore, restart, recreation, forward migration, concurrent-client conflict, cold `/config` backup/restore, unsupported-schema, unwritable-volume, health, graceful-shutdown, and Portainer/Compose contract checks.
- **Datastore authority:** SQLite remains the sole production-authoritative inventory datastore. Normal application reads and writes use only the same-origin HTTP API and SQLite. IndexedDB and legacy migration paths remain retired and browser data remains untouched.
- **Known limitations:** Cold backup requires a cleanly stopped container and the complete `/config` directory; live SQLite-file copying and live backup automation remain unsupported. Database migrations are forward-only, and image rollback requires a compatible schema or matching cold backup. Server restore supports only backup schema version 1 and remains manual and destructive. Authentication, CORS, accounts, telemetry, external persistence, and ARM64 validation remain absent.
- **Advancement decision:** Task 8 is Complete because its implementation was validated at the exact head, reviewed, merged normally, and synchronized to `main`. Task 9 is Ready because Task 8 is Complete and the proposed public demo behavior was explicitly approved on 2026-08-11. Task 10 remains Blocked by its listed dependency or an explicit decision to release without the optional demo.

## Reusable operator prompts

### Implementation prompt

Implement only the active StackMap migration task in AGENTS.md and docs/current-task.md. Validate it, commit it, push its feature branch, and open a pull request into main. Do not merge or advance the plan.

### Review prompt

Review the completed feature branch or pull request against origin/main. Do not modify files during the initial review. Report Blocking, Important, Minor, and No issue findings, and merge only if the recommendation is Ready to merge. After merging, do not modify planning files directly on main or begin another implementation task.

### Fix prompt

Stay on the existing feature branch and fix only recorded review findings. Add focused regression tests, validate, commit, and push. Do not merge or advance the plan.

### Planning advancement prompt

Start from clean, synchronized main and create a separate planning branch named for the completed task. Update only the migration plan and current-task document as required. Record implementation and merge commits, Entire checkpoints, validation, limitations, datastore authority, and whether the next task is Ready or Blocked. Open a pull request; do not implement the next task.

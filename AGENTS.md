# Agent Guidance

StackMap is migrating from a local-first frontend to a self-hosted Docker web application. Retain the React, TypeScript, and Vite frontend. The target server is Node.js 24 LTS, TypeScript, Fastify 5, and better-sqlite3, with durable data in `/config/stackmap.db`. Prefer one non-root container and one process. IndexedDB is transitional legacy storage, not the final primary datastore.

Do not add a cloud or external database, accounts, authentication, telemetry, or Docker socket access unless explicitly approved.

## Instruction authority

Use this precedence: explicit current user instruction; actual repository state and implementation; `docs/current-task.md`; this file; `docs/sqlite-migration-plan.md`; `docs/architecture.md` and `docs/decisions.md`; then other documentation. Verify implementation-sensitive facts against the code because repository state overrides stale plans. If the active task conflicts with accepted architecture, repository state, branch history, or a higher-authority instruction, stop and report the conflict rather than choosing silently.

## Scope and workflow

- Implement exactly one task from `docs/sqlite-migration-plan.md` per feature branch, using the branch in `docs/current-task.md`.
- Start from clean `main` synchronized with `origin/main`; never work directly on `main`.
- Do not start the next task, combine phases, broadly refactor unrelated frontend code, or add speculative features.
- Do not advance the backlog while technical or product decisions remain unresolved. A task that cannot be implemented or reviewed safely as one change may be split deliberately into smaller planned branches.
- Preserve existing behavior unless the active task explicitly changes it.
- Inspect an existing planned branch before reuse; never recreate, reset, or overwrite it blindly.
- Never force-push, rewrite or squash existing history, or manually modify Entire checkpoint refs or metadata.
- Confirm Entire is enabled before changes and allow its hooks to associate implementation and fix commits. Report the resulting checkpoint ID.
- Commit only after validation passes. Push the feature branch, but merge only in a separate review-and-merge task using a normal merge commit. Leave feature branches intact unless explicitly instructed otherwise.

## Validation and review

For application changes, run `npm run lint`, `npm test`, and `npm run build`. Run `npm run test:e2e` when frontend behavior, persistence, deployment behavior, or production workflows change. When Docker is available, validate tasks affecting the image, Compose, runtime, volumes, health, upgrades, or persistence. Always run `git diff --check`. Never weaken tests merely to make them pass.

Every implementation branch requires a separate read-only review of the full diff against `origin/main`. Report Blocking, Important, Minor, and No issue findings. Merge only with a Ready to merge recommendation.

## Documentation

`README.md` is public-facing and explains what StackMap is and how users deploy and use it. Put internal implementation details in `docs/architecture.md`, `docs/decisions.md`, or `docs/sqlite-migration-plan.md`. Update documentation only when the active task changes documented behavior.

## Data safety

- Never destroy or silently migrate IndexedDB data.
- Never overwrite SQLite data without explicit transactional confirmation.
- Preserve JSON import compatibility for schema versions 1 through 3 until a later approved decision changes it.
- Database migrations must be transactional and fail closed.
- Preserve existing IDs and timestamps during migration.
- Never expose secrets in client code or commit local environment files.

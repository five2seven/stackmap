# StackMap v1.2.1 Current Task

## Portainer stale-binding re-import compatibility

- **Status:** Complete
- **Planned implementation branch:** `codex/portainer-stale-binding-reimport`
- **Plan:** `docs/v1.2.1-portainer-stale-binding-reimport-plan.md`
- **Version target:** 1.2.1
- **Goal:** Allow a live Portainer container to be intentionally imported again after its previously imported StackMap service has been deleted, while preserving repeat-import protection for every binding whose target service still exists.
- **Datastore authority:** SQLite remains the sole production-authoritative inventory and provenance datastore. A deleted service leaves its existing container-binding provenance row with a null target; only an explicitly confirmed, atomic create-only import may attach that stale row to the newly created service.

### Required scope

- Treat a Portainer container binding as live only when it still points to an existing StackMap service; continue to skip and reject live bindings.
- Treat a preserved binding whose service target was deleted as stale and eligible for preview selection and re-import.
- On confirmed re-import, create a new service and atomically rebind only the matching stale container-binding row to it. Do not erase provenance globally or permit replacement of a live binding.
- After re-import, a fresh preview must again recognize the new live binding and prevent an accidental duplicate import.
- Do not show the blocking `previously imported and skipped by default` message for a stale binding. Any replacement explanation must be concise and non-blocking.
- Keep `Select all services` unchecked and non-indeterminate when the importable set is empty; preserve none/some/all behavior when eligible services exist.
- Keep `Apply host` unavailable when no eligible service is selected. Existing-host assignment, selected-only updates, valid-host intersection, cross-environment restrictions, and conflict recomputation remain unchanged when stale candidates become eligible.
- Preserve explicit acknowledgement and confirmation, expected-revision enforcement, atomic transactions, and create-only inventory semantics.

### Required tests

- Import a Portainer container, delete the resulting StackMap service, and verify the preserved binding becomes stale rather than blocking a fresh preview.
- Select the re-importable candidate, assign an existing StackMap host, confirm successfully, and verify the binding points to the newly created service.
- Verify the next preview protects the new live binding and that unrelated live bindings remain protected.
- Verify stale rows can be rebound only as part of the atomic confirmed import; tampered, repeated, stale-revision, and injected-failure paths fail closed without partial inventory or provenance mutation.
- Verify stale candidates do not receive the live-binding blocking message.
- Verify zero eligible services produces an unchecked, non-indeterminate Select all control and no usable Apply host action.
- Preserve the v1.2.0 select-all, clear-all, indeterminate, stopped/paused, provenance-bound, selected-only bulk-host, valid-host-intersection, cross-environment, conflict, per-service-control, and confirmation regressions.
- Run the full application, production E2E, demo-isolation, Linux/amd64 container, deployment, exact-head CI, and Semgrep validation required by AGENTS.md.

### Explicit exclusions

No broad provenance deletion or migration; replacement of live bindings; update or overwrite import semantics; backup format change; Portainer discovery, token lifecycle, route allowlist, RFC1918 HTTP policy, HTTPS validation, redirect handling, SQLite authority, public-demo integration, synchronization, polling, automatic refresh/import, scheduled/background work, Portainer/Docker mutation, Docker socket access, unrelated UI redesign, release, tag, GHCR publication, or Pages deployment.

### Completion record

- **Implementation pull request:** #50
- **Implementation commit:** `5bb509cab8a0740176058e2a52e6f30bbadf7fee`
- **Entire checkpoint:** `db6557066a4c`
- **Merge commit:** `e9034aeb28ffb9d7608f23acba4e6e4a6053d8ed`
- **Focused validation:** The repository, Portainer API lifecycle, preview component, and health/version suites passed 33/33 tests. Coverage verifies live-binding rejection; null-target stale-binding eligibility and reattachment; tampered confirmation without mutation; stale expected-revision rejection; injected transaction rollback; the complete import-delete-preview-re-import lifecycle; restored repeat-import protection; zero-eligible Select all state; and disabled no-selection host application.
- **Full validation:** Lint passed; the complete suite passed 243/243 tests; production and demo builds passed; production E2E passed 12/12; demo-isolation E2E passed 1/1; the production dependency audit reported zero vulnerabilities; and `git diff --check` passed. Exact-head Linux/amd64 validation passed the application suite, image build, container smoke test, and deployment, persistence, backup/restore, upgrade, health, shutdown, and failure-handling matrix.
- **Exact-head checks:** At `5bb509cab8a0740176058e2a52e6f30bbadf7fee`, build/test/container workflow run `32057531960` passed and Semgrep scan `211865808` passed.
- **Final behavior:** Live Portainer bindings continue to block accidental duplicate imports. Preserved null-target bindings become importable after their former StackMap service is deleted, and explicit confirmed create-only import atomically attaches the existing stale row to the newly created service without creating duplicate provenance. A subsequent preview recognizes that binding as live and restores repeat-import protection. Expected-revision enforcement and rollback remain intact. Zero eligible services leaves Select all unchecked and non-indeterminate, no-selection Apply host remains unavailable, and the complete v1.2.0 bulk-selection, selected-only host assignment, valid-host intersection, cross-environment restriction, conflict recomputation, per-service control, and confirmation behavior remains unchanged.
- **Completion boundary:** SQLite remains the sole production-authoritative inventory and provenance datastore. Backup/restore behavior and format, atomic create-only import, Portainer discovery and security/network-policy controls, token handling, route allowlisting, redirect rejection, and public-demo isolation remain unchanged. No synchronization, polling, refresh, update, merge, overwrite, automatic import, scheduled/background work, release, publication, or deployment behavior was added.

The single StackMap v1.2.1 stale-binding re-import task is Complete. No additional task exists in this plan; release readiness and any eventual v1.2.1 release remain separate, explicitly authorized work.

## Prior plan

The single-task v1.2.0 Portainer preview bulk-actions plan is Complete in `docs/v1.2.0-portainer-preview-bulk-actions-plan.md`, and v1.2.0 is released. This task repairs post-delete re-import compatibility without adding a new user-facing workflow, so it targets patch version 1.2.1.

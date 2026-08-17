# StackMap v1.2.0 Current Task

## Portainer preview bulk actions

- **Status:** Ready
- **Planned implementation branch:** `codex/portainer-preview-bulk-actions`
- **Plan:** `docs/v1.2.0-portainer-preview-bulk-actions-plan.md`
- **Version target:** 1.2.0
- **Goal:** Add explicit bulk service selection and target-host assignment controls to the existing Portainer import preview without changing discovery, confirmation, import, persistence, or security semantics.
- **Datastore authority:** SQLite remains the sole production-authoritative inventory and provenance datastore. Bulk actions modify only the active browser preview candidate and selected-service IDs until the user explicitly confirms import.

### Required scope

- Add a top-level checkbox labeled `Select all services` for all importable services in the current preview.
- Checking the bulk selector explicitly selects every importable service, including stopped and paused containers; unchecking it clears all service selections.
- Represent partial selection with the native indeterminate checkbox state and preserve every per-service checkbox.
- Preserve the current default that stopped and paused containers are not selected automatically. Bulk selection must never carry into another preview, session, refresh, or import.
- Add a control labeled `Set host for selected services` that offers every valid target host available in the preview, including proposed hosts and existing target hosts.
- Applying a bulk host choice updates only currently selected service candidates. Unselected candidates and all inventory records remain unchanged.
- Preserve each per-service target-host dropdown before and after bulk actions.
- Recompute container-name and host-port conflicts through the existing `recomputePreviewConflicts` logic after bulk and individual host changes.
- Keep explicit acknowledgement and confirmation as the only path to database mutation.

### Required tests

- Select all importable services and clear all selections.
- Show checked, unchecked, and indeterminate aggregate states accurately.
- Leave stopped and paused containers unselected by default, while explicit Select all includes them.
- Apply one valid host only to selected services and leave unselected services unchanged.
- Recompute host-scoped container-name and host-port conflicts after bulk assignment.
- Confirm per-service selection and target-host controls still work after bulk actions.
- Run the full application, production E2E, demo-isolation, Linux/amd64 container, deployment, exact-head CI, and Semgrep validation required by AGENTS.md.

### Explicit exclusions

No Portainer discovery, API response projection, token lifecycle, route allowlist, RFC1918 HTTP policy, HTTPS validation, redirect handling, provenance, import confirmation, create-only semantics, database or backup schema, SQLite authority, public-demo integration, synchronization, polling, refresh, update, merge, overwrite, automatic import, scheduled/background work, Portainer/Docker mutation, Docker socket access, release, tag, GHCR publication, Pages deployment, or unrelated UI redesign.

### Start condition

Implementation may begin only after this planning pull request receives a separate read-only review, is marked ready, and is merged normally. Implementation must use its own feature branch and pull request. No release or publication action is authorized.

## Prior plan

The single-task v1.1.3 Portainer Docker PortSummary compatibility plan remains Complete in `docs/v1.1.3-portainer-port-summary-compatibility-plan.md`, and v1.1.3 is released. This additive user-facing workflow targets the next minor version, 1.2.0.

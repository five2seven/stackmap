# StackMap v1.2.0 Current Task

## Portainer preview bulk actions

- **Status:** Complete
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

### Completion record

- **Implementation pull request:** #47
- **Implementation head:** `0e647ea9228b5b59d1370533d80540cfae757c26`
- **Entire checkpoint:** `def4fa15286a`
- **Merge commit:** `58a2baa4de0968b58ac01a2b094ce77246188b48`
- **Focused validation:** The final Portainer preview component and confirmation-boundary suites passed 17/17 tests. Coverage verifies select all, clear all, indeterminate state, stopped/paused defaults and explicit inclusion, provenance-bound exclusion, selected-only bulk host assignment, per-service host restrictions, the valid-host intersection for bulk assignment, existing and same-environment proposed hosts, cross-environment exclusion and tamper rejection, conflict recomputation, individual controls, and final confirmation payloads.
- **Full validation:** Lint passed; the complete suite passed 239/239 tests; production and demo builds passed; production E2E passed 12/12; demo-isolation E2E passed 1/1; the production dependency audit reported zero vulnerabilities; applicable syntax checks passed; and `git diff --check` passed. Exact-head Linux/amd64 validation passed the application suite, image build, container smoke test, and deployment, persistence, backup/restore, upgrade, health, shutdown, and failure-handling matrix.
- **Exact-head checks:** At `0e647ea9228b5b59d1370533d80540cfae757c26`, build/test/container workflow run `32044100137` passed and Semgrep scan `211773735` passed.
- **Final behavior:** `Select all services` selects every importable service and clearing it removes every selection, with a native indeterminate state for partial selection. Stopped and paused services remain unselected by default but are included by an explicit Select all action. Provenance-bound and otherwise non-importable services remain excluded. Bulk host assignment changes only selected candidates and offers only choices valid for every selected service: existing StackMap hosts remain available, while a proposed Portainer host is available only when it belongs to every selected service's environment. Cross-environment proposed hosts are not offered. Host-scoped conflicts recompute through the existing logic, individual selection and host controls remain functional, and confirmation submits the final selected preview candidates through the unchanged import boundary.
- **Completion boundary:** Bulk actions remain scoped to the active browser preview. Explicit acknowledgement and confirmation remain the first database-mutation boundary, and atomic create-only import, expected-revision handling, provenance, SQLite authority, Portainer discovery and security/network-policy controls, and demo isolation remain unchanged. No synchronization, polling, refresh, update, merge, overwrite, automatic import, scheduled/background work, release, publication, or deployment behavior was added.

The single StackMap v1.2.0 Portainer preview bulk-actions task is Complete. No additional task exists in this plan; release readiness and any eventual v1.2.0 release remain separate, explicitly authorized work.

## Prior plan

The single-task v1.1.3 Portainer Docker PortSummary compatibility plan remains Complete in `docs/v1.1.3-portainer-port-summary-compatibility-plan.md`, and v1.1.3 is released. This additive user-facing workflow targets the next minor version, 1.2.0.

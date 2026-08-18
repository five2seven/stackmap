# StackMap v1.3.0 Current Task

## Portainer bind-mount purpose inference

- **Status:** Complete
- **Planned implementation branch:** `codex/portainer-bind-mount-purpose-inference`
- **Plan:** `docs/v1.3.0-portainer-bind-mount-purpose-inference-plan.md`
- **Version target:** 1.3.0
- **Goal:** Infer conservative, user-editable purposes for high-confidence Portainer bind mounts while keeping ambiguous purposes blank and importing exactly the final confirmed preview state.
- **Datastore authority:** SQLite remains the sole production-authoritative inventory and provenance datastore. Purpose inference occurs only while constructing an in-memory Portainer preview; no inventory mutation occurs until the existing explicitly acknowledged, expected-revision-checked, atomic create-only import.

### Confirmed current behavior

- `PathMapping.purpose` is a free-form string, not an enum. Blank is valid. Existing application-generated conventions include `Configuration`, `Data`, `Application data`, and `Media library`.
- Portainer preview construction currently assigns `purpose: ''` to every discovered bind mount.
- The Portainer preview displays a bind mount only as an include/remove checkbox and path pair; it does not currently expose an editable purpose field.
- Confirmation currently accepts paths only as exact subsets of the original preview paths. Purpose edits therefore require a narrow validation change that permits only the final purpose text to differ while retaining path identity and all other trusted mount fields.
- `No configuration-purpose mapping recorded.` is specifically driven by the absence of any purpose containing `config`; it is not a generic empty-purpose warning. The planned clearer wording is `No path is marked for configuration.`

### Required scope

- Infer purpose from normalized container-path semantics only; do not use host-path naming in the initial rule set.
- Consider only absolute POSIX-style container destinations. Use exact terminal path segments after trimming, case-folding, collapsing redundant separators, and ignoring trailing slashes. Preserve the original displayed container path.
- Infer `Configuration` for terminal `config`, `configs`, `configuration`, or `conf` segments.
- Infer `Metadata` for a terminal `metadata` segment. `Metadata` is ordinary free-form purpose text, not a new domain enum/category.
- Infer the existing `Media library` convention for terminal `movies`, `tv`, `music`, `audiobooks`, `books`, or `photos` segments.
- Leave `/data` and every other ambiguous or unmatched path blank. Do not infer `Application data` merely from a generic `data` segment.
- Show each included bind mount's purpose in the preview and allow the user to edit or clear it before confirmation.
- Confirmation must accept a bounded final purpose edit or clear operation for an original path, reject changes to mount identity, host path, container path, access mode, or unoffered paths, and import the exact final preview value without recomputing inference.
- Replace the configuration-specific warning text with `No path is marked for configuration.` only if focused tests confirm the underlying configuration-specific predicate remains unchanged.
- Preserve selection, host assignment, conflicts, live/stale provenance, confirmation, expected-revision, transaction, and create-only behavior.

### Required tests

- Unit-test inference for `/config`, nested configuration terminal segments, `/metadata`, `/movies`, `/tv`, `/music`, `/audiobooks`, `/books`, and `/photos`.
- Verify case and trailing/redundant-separator normalization without modifying the source container path.
- Verify `/data`, partial-name matches, and unrelated/ambiguous destinations remain blank; verify host-path names alone never trigger inference.
- Verify inferred purposes are visible and editable in the preview.
- Verify a user override is carried through confirmation and persisted by import, and a user-cleared inferred purpose remains blank.
- Verify tampering with any non-purpose mount field or adding an unoffered path is rejected without mutation.
- Verify the clearer warning remains configuration-specific and disappears only when a configuration purpose is present.
- Preserve all Portainer discovery, confirmation, stale/live binding, select-all, bulk/per-service host, host-intersection, cross-environment, conflict, rollback, backup/restore, and demo-isolation regressions.
- Run the complete application, production E2E, demo-isolation, Linux/amd64 container/deployment, exact-head CI, Semgrep, audit, and `git diff --check` validation required by AGENTS.md.

### Explicit exclusions

No purpose enum or new category system; host-path-driven inference; image-specific heuristics; fuzzy substring or probabilistic classification; inference after confirmation; database or backup-format migration; update/overwrite import; change to Portainer discovery, token lifecycle, route allowlisting, RFC1918 HTTP policy, HTTPS validation, redirect rejection, provenance, SQLite authority, backup/restore, or demo behavior; synchronization, polling, refresh, automatic update/import, scheduled/background work; unrelated UI redesign; release, tag, Release, GHCR publication, or Pages deployment.

### Completion record

- **Implementation PR:** #55
- **Implementation commit:** `ecd2e20e02de6020472c6653bb322fb12edd7253`
- **Entire checkpoint:** `4e2e57b38f98`
- **Merge commit:** `78b55a591f743655bfc25401f7952284cbf676ad`
- **Focused validation:** The initial six-file Portainer/UI selection ran 91 tests successfully. The final four-file focused regression selection ran 67 tests successfully after confirmation-tamper coverage was expanded.
- **Full validation:** Lint, 265 unit/integration/component tests across 24 files, production and demo builds, 12 production E2E tests, the demo-isolation E2E test, dependency audit, script syntax checks, and `git diff --check` passed. Exact-head CI additionally built and exercised the Linux/amd64 image and passed container smoke, deployment, persistence, backup/restore, upgrade, health, shutdown, and failure-path validation.
- **Exact-head checks:** CI run `32081328247` passed for exact implementation head `ecd2e20e02de6020472c6653bb322fb12edd7253`; Semgrep run `212018868` passed with no blocking findings.

### Final behavior

- Portainer preview construction infers `Configuration`, `Metadata`, or `Media library` only from the approved exact terminal segments of normalized absolute POSIX container destinations. `/data`, partial matches, relative or Windows-style paths, ambiguous destinations, and host-path-only signals remain blank.
- The preview exposes an editable purpose for each included bind mount. Users may override or clear an inference, and confirmation imports that final preview value exactly without recomputing it.
- Confirmation accepts only bounded purpose changes for offered path IDs. Path identity, host and container paths, read-only state, shape, and subset constraints remain fail-closed.
- The configuration warning now reads `No path is marked for configuration.` while retaining its existing configuration-specific predicate.
- Create-only explicit confirmation, expected-revision and atomic rollback behavior, live/stale provenance, bulk selection and host assignment, host-option intersection, cross-environment restrictions, conflict handling, SQLite authority, backup/restore, Portainer security and network policy, token handling, and demo isolation remain unchanged. No synchronization, polling, refresh, overwrite, update, automatic import, scheduled work, or background behavior was added.

The single StackMap v1.3.0 Portainer bind-mount purpose-inference task is Complete. The plan is Complete with no additional task. Release readiness and any eventual release remain separate work.

## Prior plan

The single-task v1.2.1 Portainer stale-binding re-import plan is Complete in `docs/v1.2.1-portainer-stale-binding-reimport-plan.md`, and v1.2.1 is released. This v1.3.0 task preserves that behavior.

# StackMap v1.1.2 Current Task

## Portainer environment compatibility

- **Status:** Ready
- **Planned implementation branch:** `codex/portainer-environment-compatibility`
- **Plan:** `docs/v1.1.2-portainer-environment-compatibility-plan.md`
- **Version target:** 1.1.2
- **Goal:** Recognize Portainer endpoint type 1 as Docker-compatible when `ContainerEngine` is blank, while preserving explicit Docker-engine support and rejecting unsupported endpoint types.
- **Datastore authority:** SQLite remains the sole production-authoritative inventory and provenance datastore. This task changes no database schema, data mapping, backup/restore behavior, provenance behavior, or UI workflow.

### Required scope

- Accept a Portainer environment with `Type: 1` and a blank `ContainerEngine` as Docker-compatible, matching Portainer's local Docker endpoint semantics.
- Continue accepting environments that explicitly report `ContainerEngine: docker`; use endpoint type to reject a response only when it clearly identifies a non-Docker environment.
- Continue rejecting clearly unsupported or non-Docker endpoint types; do not infer compatibility from endpoint name, URL, status, or other arbitrary fields.
- Treat the omitted optional `PublicURL` in the exact reported response as empty without relaxing validation of required endpoint fields.
- Add an exact regression fixture for the reported local endpoint response and focused accepted/rejected environment tests.
- Preserve discovery, preview, confirmation, create-only import, provenance, API-token handling, route allowlisting, HTTP/HTTPS network policy, response projection, and demo isolation.
- Update patch-version and release-readiness metadata for 1.1.2 during implementation only where required by established repository practice.

### Explicit exclusions

No UI redesign; synchronization, polling, update, merge, overwrite, automatic import, refresh, or background behavior; database or backup-schema change; Portainer or Docker mutation; Docker socket access; new outbound routes; TLS-policy change; public-demo integration; release, tag, GHCR publication, Pages deployment; or unrelated product work.

### Start condition

Implementation may begin only after this planning pull request receives a separate read-only review, is marked ready, and is merged normally. Implementation must then use its own feature branch and pull request. No release or publication action is authorized.

## Prior plan

The StackMap v1.1.1 private-LAN Portainer HTTP plan remains Complete in `docs/v1.1.1-private-lan-portainer-http-plan.md`. Version 1.1.1 is already released, so this compatibility fix targets the next patch version, 1.1.2.

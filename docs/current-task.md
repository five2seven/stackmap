# StackMap v1.1.3 Current Task

## Portainer Docker port-summary compatibility

- **Status:** Ready
- **Planned implementation branch:** `codex/portainer-port-summary-compatibility`
- **Plan:** `docs/v1.1.3-portainer-port-summary-compatibility-plan.md`
- **Version target:** 1.1.3
- **Goal:** Accept documented Docker container-list port summaries for unpublished ports when `IP` is omitted and `PublicPort` is omitted or null, without creating false host-port mappings or weakening validation of required Docker fields.
- **Datastore authority:** SQLite remains the sole production-authoritative inventory and provenance datastore. This task changes no database schema, data mapping outside Docker port projection, backup/restore behavior, provenance behavior, or UI workflow.

### Confirmed root cause

- Portainer connection and environment discovery succeed, but preview fails while projecting `GET /api/endpoints/1/docker/containers/json?all=true`.
- The current decoder always validates `IP` as a string even though Docker's `PortSummary` schema makes `IP` optional.
- The decoder treats only an omitted `PublicPort` as unpublished; a valid `PublicPort: null` is sent to strict numeric validation and rejected.
- Both incompatibilities independently produce `PORTAINER_INVALID_RESPONSE`. Docker requires `PrivatePort` and `Type`; those fields remain strictly validated.

### Required scope

- Treat omitted `IP` as the absence of a host bind address for a Docker port summary.
- Treat omitted or null `PublicPort` as unpublished and do not create a host-port mapping.
- Preserve published-port behavior when valid `IP` and `PublicPort` values are present.
- Add exact regression fixtures for `{ "PrivatePort": 2442, "PublicPort": null, "Type": "tcp" }` and an omitted-`PublicPort` equivalent, both with omitted `IP`.
- Verify containers containing unpublished ports remain in preview and those ports do not become host-port mappings or false host-port conflicts.
- Preserve strict validation of Docker-required `PrivatePort` and `Type`, and preserve existing response size, container count, projection, and error boundaries.
- Keep the remainder of the container-list decoder unchanged unless a compatibility adjustment is directly justified by documented Docker Engine API semantics and covered by focused tests.
- Preserve Portainer security/network policy, token handling, route allowlisting, discovery, preview/confirmation workflow, create-only import, provenance, SQLite authority, UI behavior, and demo isolation.
- Update patch-version and release-readiness metadata for 1.1.3 during implementation only where required by repository practice.

### Explicit exclusions

No broad optional-field relaxation; UI redesign; synchronization, polling, update, merge, overwrite, automatic import/refresh, scheduled or background behavior; database or backup-schema change; Portainer or Docker mutation; Docker socket access; security/network-policy change; new outbound route; public-demo integration; release, tag, GHCR publication, Pages deployment; or unrelated product work.

### Start condition

Implementation may begin only after this planning pull request receives a separate read-only review, is marked ready, and is merged normally. Implementation must then use its own feature branch and pull request. No release or publication action is authorized.

## Prior plan

The StackMap v1.1.2 Portainer environment compatibility plan remains Complete in `docs/v1.1.2-portainer-environment-compatibility-plan.md`. Version 1.1.2 is released, so this compatibility fix targets the next patch version, 1.1.3.

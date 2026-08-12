# StackMap v1.1.1 Current Task

## Private-LAN Portainer HTTP support

- **Status:** Ready
- **Planned implementation branch:** `codex/portainer-private-lan-http`
- **Plan:** `docs/v1.1.1-private-lan-portainer-http-plan.md`
- **Version target:** 1.1.1
- **Goal:** Permit the server-configured Portainer origin to use HTTP only when startup resolution and the actual connection lookup both establish that every destination is RFC1918 IPv4.
- **Datastore authority:** SQLite remains the sole production-authoritative inventory and provenance datastore. This task changes no database schema, data mapping, backup/restore behavior, or UI workflow.

### Required scope

- Keep existing HTTPS behavior and normal certificate validation unchanged.
- Accept HTTP only for destinations resolving exclusively to `10.0.0.0/8`, `172.16.0.0/12`, or `192.168.0.0/16`.
- Validate at startup and enforce the same policy in the actual per-request connection lookup, preserving the configured hostname and `Host` header while connecting only to a validated address.
- Fail closed for loopback, link-local, metadata-service, multicast, unspecified, CGNAT, IPv6, mixed private/public DNS, resolution failure, and every other non-RFC1918 destination.
- Reject redirects and ensure `X-API-Key` is never attached or sent when destination validation fails.
- Preserve the GET-only route allowlist, short-lived non-persistent token handling, response limits, strict projection, and secret exclusions.
- Add focused network-policy tests and real container/E2E proof using an RFC1918 Docker-network Portainer fixture.
- Update operator/security documentation and version/release metadata for 1.1.1 during implementation and release-readiness work, not in this planning change.

### Explicit exclusions

No insecure-TLS or certificate-verification bypass; Cloudflare Access support; synchronization, update, polling, refresh, or background behavior; database changes; backup-schema changes; Portainer/Docker mutation; UI workflow changes; public-demo integration; or unrelated product work.

### Start condition

Implementation may begin only after this planning pull request receives a separate read-only review, is marked ready, and is merged normally. The implementation must use its own feature branch and pull request and must not tag, release, publish GHCR, or deploy Pages.

## Prior plan

The two-phase StackMap v1.1 Portainer import plan remains Complete in `docs/v1.1-portainer-import-plan.md`; no Phase 3 was added.

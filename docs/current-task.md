# StackMap v1.1.1 Current Task

## Private-LAN Portainer HTTP support

- **Status:** Complete
- **Implementation branch:** `codex/portainer-private-lan-http`
- **Implementation commit:** `ac656c1b2422dc55917274a406c75df4ed40327d`
- **Entire checkpoint:** `116447fcc737`
- **Pull request:** #36
- **Merge commit:** `d5a38c6b8c6948e39e2a4bc30ae3228e285007b7`
- **Version target:** 1.1.1
- **Focused validation:** The configuration, network-policy, Portainer client, and Portainer API suite passed 49/49 tests. Coverage includes exact RFC1918 boundaries, rejected address classes, literal and DNS destinations, mixed/private-public and IPv6 resolution, startup timeout/failure, per-request rebinding rejection before requester construction, pinned connection identity with preserved `Host`, redirect rejection, and unchanged HTTPS delegation. Server TypeScript and lint also passed.
- **Full validation:** The complete suite passed 232/232 tests; production and demo builds passed; production E2E passed 12/12; demo-isolation E2E passed 1/1; the production dependency audit reported zero vulnerabilities; fake-Portainer script syntax and `git diff --check` passed. The exact-head Linux/amd64 workflow passed its image build, smoke test, real RFC1918 Docker-network HTTP Portainer import, request-history allowlist/hostname/token assertions, loopback startup rejection without a credential-bearing request, and deployment, persistence, backup/restore, upgrade, health, shutdown, and failure regressions.
- **Exact-head CI:** At `ac656c1b2422dc55917274a406c75df4ed40327d`, the build/test/container workflow run `31646192861` and Semgrep scan `209633276` both passed.
- **Datastore authority:** SQLite remains the sole production-authoritative inventory and provenance datastore. This task made no database, repository, backup-schema, restore, mapping, confirmation, or UI workflow change.
- **Final security boundary:** HTTPS continues to use native fetch with normal system certificate and hostname validation. HTTP is accepted only when startup resolution and every actual connection-time lookup return exclusively IPv4 in `10.0.0.0/8`, `172.16.0.0/12`, or `192.168.0.0/16`. Literal IPs and DNS hostnames use the same classifier. Empty, failed, loopback, link-local/metadata-service, multicast, unspecified, CGNAT, IPv6, mixed private/public, and every other non-RFC1918 result fail closed. Each HTTP socket is pinned to the addresses validated for that request while preserving the configured hostname and `Host`; validation failure occurs before requester construction, redirects are not followed, and the existing four-route GET-only allowlist and short-lived non-persistent token handling remain unchanged.
- **Completion boundary:** No TLS bypass, custom trust control, Cloudflare Access support, synchronization, polling, refresh, update, merge, overwrite, background work, arbitrary Portainer destination/route, Docker or Portainer mutation, database/UI behavior, or public-demo integration was added.

## Plan status

- **Single-task v1.1.1 private-LAN Portainer HTTP plan:** Complete
- **Additional task:** Does not exist

This closeout records the merged implementation only. It does not tag or release v1.1.1, publish GHCR, deploy Pages, or authorize another product task.

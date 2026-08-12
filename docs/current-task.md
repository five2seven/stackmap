# StackMap v1.1 Current Task

## Portainer API import

The completed SQLite migration backlog remains closed. StackMap v1.1 Portainer API import is a separately approved two-phase plan defined in `docs/v1.1-portainer-import-plan.md`.

### Phase 1: Portainer discovery and preview

- **Status:** Ready
- **Implementation branch:** `codex/portainer-discovery-preview`
- **Goal:** Add the production-only, server-mediated Portainer connection, read-only discovery, conservative StackMap mapping, duplicate/conflict analysis, and explicit preview workflow without adding any inventory mutation path.
- **Datastore authority after completion:** SQLite remains the sole authoritative inventory datastore. Portainer is a manually queried read-only discovery source; short-lived server-memory connection and preview state is non-authoritative.
- **Required boundary:** Implement only Phase 1 from `docs/v1.1-portainer-import-plan.md`. Do not implement confirmation, inventory insertion, source/binding persistence, restore cleanup, synchronization, polling, background refresh, or any Portainer/Docker mutation.
- **Dependencies:** The v1.1 planning pull request must be reviewed and merged before Phase 1 implementation begins.

Phase 2 remains Blocked until Phase 1 is implemented, independently reviewed, merged normally, and recorded through a separate planning-advancement pull request.

# StackMap v1.1 Current Task

## Portainer API import

The completed SQLite migration backlog remains closed. StackMap v1.1 Portainer API import is a separately approved two-phase plan defined in `docs/v1.1-portainer-import-plan.md`.

### Phase 1: Portainer discovery and preview

- **Status:** Complete
- **Implementation branch:** `codex/portainer-discovery-preview`
- **Implementation commit:** `5cf9c620acd396409d096d994950e3f17dc5ebdc`
- **Review-fix commit:** `7617893cd51bb87d2c2435d2c4e0a798b9957d45`
- **Entire checkpoints:** `52a73ac10594`, `778e982c86da`
- **Pull request:** #30
- **Merge commit:** `8c8aa921b5e914721da5fd73f1b5faee6de634d7`
- **Validation:** Focused Phase 1 tests passed (13/13 at final head); lint passed; the complete unit suite passed (182/182); production and demo builds passed; production E2E passed (12/12); demo-isolation E2E passed (1/1); production dependency audit reported zero vulnerabilities; and `git diff --check` passed.
- **Exact-head CI:** At `7617893cd51bb87d2c2435d2c4e0a798b9957d45`, the container build/test/publish workflow and Semgrep scan both passed.
- **Datastore authority:** SQLite remains the sole production-authoritative inventory datastore. Portainer and volatile preview state remain read-only and non-authoritative.
- **Phase boundary:** Phase 2 was not started in Phase 1 or its review fixes. Phase 1 added no confirmation/import mutation, provenance tables, restore cleanup, synchronization, polling, or background refresh.

### Phase 2: Atomic confirmation, hardening, and release completion

- **Status:** Ready
- **Implementation branch:** `codex/portainer-atomic-import`
- **Goal:** Add explicit atomic import of the reviewed selection, durable non-secret repeat-import metadata, restore integration, full operational hardening, and v1.1 documentation.
- **Datastore authority after completion:** SQLite remains the sole authoritative inventory and provenance datastore. Portainer remains a manual, read-only discovery source; credentials and previews remain volatile and non-authoritative.
- **Required boundary:** Implement only Phase 2 from `docs/v1.1-portainer-import-plan.md`. Do not add synchronization, polling, background refresh, automatic import, update/merge/overwrite behavior, saved credentials, arbitrary Portainer origins, Docker socket/direct-host access, Portainer/Docker mutation, sensitive-field import, or public-demo integration.
- **Dependencies:** Phase 1 is implemented, independently reviewed, merged normally, and recorded. No unresolved blocker remains.

Do not begin any later v1.1 work until Phase 2 is implemented, independently reviewed, merged normally, and recorded through a separate planning-closeout pull request.

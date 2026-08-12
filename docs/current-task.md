# StackMap v1.1 Current Task

## Portainer API import

The completed SQLite migration backlog remains closed. The separately approved two-phase StackMap v1.1 Portainer API import plan defined in `docs/v1.1-portainer-import-plan.md` is Complete. No Phase 3 exists.

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

- **Status:** Complete
- **Implementation branch:** `codex/portainer-atomic-import`
- **Implementation commit:** `763d8548b21b3ba98365947c4e2b70f1f8182521`
- **Review-fix commit:** `0ded11911d4eae01661ee600d4d443cff0ab98ee`
- **Entire checkpoints:** `ca5f8d79abef`, `7e055373eb13`
- **Pull request:** #32
- **Merge commit:** `05a4050fc6a9a5629a57c02b638897dcfd6883c3`
- **Focused validation:** Initial focused Phase 2 coverage passed 29 tests. At the final reviewed head, focused UI, API, repository, and preview coverage passed 23/23, including explicit container selection, import-success/refresh-failure separation, exact candidate deselection, and rollback injection after all six transaction stages.
- **Full validation:** At the final reviewed head, lint passed; the complete unit suite passed 196/196; production and demo builds passed; real server-backed production E2E passed 12/12; demo-isolation E2E passed 1/1; the production dependency audit reported zero vulnerabilities; and `git diff --check` passed. The exact-head Linux/amd64 container workflow passed its real TLS Portainer import, provenance, nested-selection, repeat-import, restart/recreation, restore-cleanup, non-root, read-only-root, `/config`, backup/restore, upgrade, health, and shutdown regressions.
- **Exact-head CI:** At `0ded11911d4eae01661ee600d4d443cff0ab98ee`, the build/test/publish container workflow and Semgrep scan both passed.
- **Datastore authority:** SQLite remains the sole authoritative inventory and provenance datastore. Portainer remains a manual, read-only discovery source; credentials and previews remain volatile, short-lived, and non-authoritative.
- **Completion boundary:** Phase 2 added no synchronization, polling, background refresh, automatic import, update, merge, overwrite, or existing-service refresh behavior. The portable backup schema and public-demo isolation remain unchanged.

## Plan status

- **Two-phase v1.1 Portainer import plan:** Complete
- **Phase 1:** Complete
- **Phase 2:** Complete
- **Phase 3:** Does not exist

This planning closeout does not tag or release v1.1.0 and does not authorize additional v1.1 implementation work.

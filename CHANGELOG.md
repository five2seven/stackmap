# Changelog

## Unreleased

- Verified Entire checkpoint capture from a Codex CLI session.

### Added

- First functional local-first StackMap MVP increment
- IndexedDB persistence through Dexie with a versioned local schema
- Service creation, editing, retirement, confirmed permanent deletion, search, and filters
- Multiple service ports, service dependencies, and optional host assignments
- Minimal host creation, editing, assignment, and referenced-host deletion protection
- Duplicate host-port conflict warnings and incomplete-record indicators
- Versioned JSON export plus validated, confirmed JSON import
- Responsive desktop and tablet interface with clear empty states
- Optional service descriptions, container names, Docker images, and application URLs
- Duplicate container-name warnings for non-retired services on the same host
- IndexedDB version 3 migration and JSON schema version 2 with version 1 import compatibility
- Unit, database, UI behavior, and Playwright coverage for the MVP workflows

### Fixed

- Persist the local dataset schema version and migrate existing version 1 databases safely
- Reject invalid timestamps, blank IDs, self-dependencies, and duplicate dependency IDs during import
- Preserve existing data when an imported replacement cannot be written
- Ignore empty port rows and detect duplicate host ports within a single service
- Show service dependencies in the overview
- Report storage failures without silently closing forms
- Provide accurate retirement feedback and record-specific accessible action labels
- Explain referenced-host deletion protection without relying on hover text

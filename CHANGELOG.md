# Changelog

## Unreleased

## 1.2.1

### Fixed

- Allow a Portainer container to be imported again after its previously imported StackMap service is deleted, while preserving atomic create-only import and duplicate protection for live bindings.

## 1.2.0

### Added

- Add preview-scoped controls to select or clear all importable Portainer services and assign one target host to the current selection, while preserving per-service edits and explicit confirmation.

## 1.1.3

### Fixed

- Accept Docker container summaries whose unpublished ports omit `IP` and omit or return null for `PublicPort`, without creating false host-port mappings.

## 1.1.2

### Fixed

- Recognize Portainer local Docker environments that report endpoint type 1 with a blank `ContainerEngine`, while preserving explicit Docker-engine support and rejecting unsupported or non-Docker endpoint types.

## 1.1.1

### Added

- Allow cleartext Portainer HTTP only when startup and per-request connection resolution are exclusively RFC1918 IPv4.

### Security

- Pin HTTP connections to the per-request validated private address set, reject DNS rebinding and all non-RFC1918/IPv6 results before sending `X-API-Key`, and preserve redirect rejection and normal HTTPS certificate validation.

## Earlier releases

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
- Repeatable Docker path mappings with purpose, read-only status, search, display, and initial warnings
- IndexedDB version 4 legacy-path migration and JSON schema version 3 with version 1 and 2 import compatibility
- Dedicated responsive Port Map with host grouping, Unassigned host handling, host filtering, searchable assignments, conflict relationships, incomplete-state details, and edit-from-map actions
- Dedicated responsive Path Map with host and normalized host-path grouping, shared-path details, warning reuse, searchable mappings, host filtering, incomplete states, and edit-from-map actions
- Unit, database, UI behavior, and Playwright coverage for the MVP workflows
- Production multi-stage Docker image with a non-root nginx runtime, SPA routing, caching, security headers, and container health check
- Hardened Docker Compose and copy-and-paste Portainer Stack deployment examples without an application-data volume
- GitHub Container Registry workflow for `latest`, semantic-version, and immutable commit image tags
- Self-hosting documentation for browser IndexedDB persistence, JSON backups, stable origins, upgrades, and reverse proxies

### Fixed

- Support local record ID generation in plain HTTP LAN deployments where `crypto.randomUUID()` is unavailable
- Persist the local dataset schema version and migrate existing version 1 databases safely
- Reject invalid timestamps, blank IDs, self-dependencies, and duplicate dependency IDs during import
- Preserve existing data when an imported replacement cannot be written
- Ignore empty port rows and detect duplicate host ports within a single service
- Show service dependencies in the overview
- Report storage failures without silently closing forms
- Provide accurate retirement feedback and record-specific accessible action labels
- Explain referenced-host deletion protection without relying on hover text

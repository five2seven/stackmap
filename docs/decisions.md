# Architecture Decisions

Record durable technical choices here so future contributors understand their context and tradeoffs.

## ADR-001: React with TypeScript and Vite

**Status:** Accepted

**Context:** `StackMap` needs a lightweight, reusable frontend foundation.

**Decision:** Use React for the user interface, TypeScript for static checks, and Vite for development and production builds.

**Consequences:** The starter has a fast local workflow and a small configuration surface. Product-specific architecture remains intentionally undecided.

## ADR-002: Frontend-only starter

**Status:** Accepted

**Context:** The template must remain reusable across applications with different infrastructure needs.

**Decision:** Do not include a backend, authentication, payments, external APIs, or app-specific features.

**Consequences:** Applications add those capabilities only when their requirements and security model are known.

## ADR-003: Standard POC deployment foundation

**Status:** Accepted

**Context:** Applications created from the starter need a consistent proof-of-concept publishing convention without coupling application code to deployment providers.

**Decision:** Use GitHub for source control, Cloudflare Pages for POC hosting, Cloudflare for DNS, and Porkbun as the registrar for the `rareobjectlabs.app` umbrella domain. Each application uses `stackmap.rareobjectlabs.app`, which defaults to `stackmap.rareobjectlabs.app`.

**Consequences:** POC URLs are predictable across applications. DNS and hosting remain external configuration concerns; this decision adds no Cloudflare-specific application code and provisions no resources.

## ADR-004: MVP Data Model

**Status:** Accepted

### Record Types

The MVP should use these primary record types:

#### Service

Represents a self-hosted application or planned service.

Fields:

- id
- name
- containerName
- dockerImage
- description
- applicationUrl
- status
- hostId
- internalUrl
- ports
- paths
- network
- exposure
- dependencyIds
- notes
- createdAt
- updatedAt

#### Host

Represents the device, server, VM, NAS, or other system where services run.

Fields:

- id
- name
- type
- ipAddress
- operatingSystem
- notes
- createdAt
- updatedAt

### Field Behavior

- Only service name is required when creating a service.
- Container name, Docker image, description, and application URL are optional.
- Application URL represents the address opened by a user; internalUrl remains the internal hostname or IP.
- Host assignment is optional.
- A service may use multiple ports.
- A service may have zero or more path mappings. Each mapping has a stable ID, host path, container path, purpose, and read-only flag.
- A service may depend on multiple other services.
- Incomplete records are valid.
- Planned, paused, and retired services remain visible unless filtered out.
- Retiring a service is preferred over deleting it when historical context may matter.

### Enumerated Values

Service status:

- active
- planned
- paused
- retired

Exposure:

- local
- vpn
- reverse-proxy
- public
- unknown

Host type:

- physical
- virtual-machine
- container-host
- nas
- other
- unknown

### Ports

Each service port entry should support:

- hostPort
- containerPort
- protocol
- description

Protocol values:

- tcp
- udp
- both
- unknown

### Local Data Versioning

- Store a schema version with the local dataset.
- Keep migration logic separate from UI components.
- Future schema changes should migrate existing data where practical.
- Import files must be validated before replacing local data.
- JSON schema version 2 accepts and migrates valid version 1 backups.
- JSON schema version 3 accepts versions 1 and 2, converts legacy fixed paths in memory, and exports only generalized paths.
- IndexedDB version 4 performs the corresponding local-record migration; database and backup schema versions are independent.

### Deletion Behavior

- Services may be permanently deleted only after confirmation.
- Retired services remain stored.
- Hosts cannot be deleted while services reference them unless the user first reassigns or removes those references.

### Rationale

This model keeps the MVP simple while still supporting duplicate-port detection, filtering, dependencies, incomplete records, and future migration.

Non-retired services with matching trimmed, case-insensitive container names on the same host are flagged as conflicts. Blank names, unassigned services, cross-host matches, and retired services are ignored.

Path warnings identify incomplete host/container pairs, mixed absolute and relative host or container styles, and missing purposes containing `config`. Path normalization and cross-service shared-path checks remain out of scope.

### Derived Port Map

The Port Map is derived rather than persisted, so service ports retain one source of truth and no database migration is required. Assignments are grouped by host, with hostless services in an Unassigned host group; valid host ports sort numerically before incomplete entries. Search covers service name, container name, Docker image, host name, host port, container port, and protocol. The host filter and edit-from-map workflow remain local UI state.

Conflict relationships reuse the existing rules: matching host ports conflict only on the same assigned host when protocols overlap; `both` overlaps TCP and UDP, while `unknown` overlaps only `unknown`. The existing policy includes retired services. The displayed count is explicitly the number of affected assignments. Network/protocol filters, recommendations, and automated reassignment remain out of scope.

### Derived Path Map

The Path Map is a non-persistent projection of generalized path mappings. It groups first by assigned host, with hostless services under Unassigned host, and then by host paths compared after trimming and case folding. The original stored value remains visible. Blank host paths remain in a labeled incomplete group. Search covers service and container identity, host, both paths, purpose, and read-only or writable access; filtering is by host.

A non-empty host path is informationally shared only when more than one distinct service uses it on the same assigned host. Same-service duplicates and identical paths on different hosts do not qualify, and displayed service names are deduplicated. Retired services remain included, consistent with current port-conflict and path-warning behavior. Existing mapping-pair, mixed-style, and missing-configuration warnings are reused. Path correction, rewriting, cross-service consistency errors, and graphical topology remain out of scope, and no schema migration is required.

## ADR-005: Stateless self-hosted container

**Status:** Superseded by ADR-006

**Context:** Homelab users need an image-based Portainer deployment that does not require cloning or building the repository, while StackMap remains a frontend-only local-first application.

**Decision:** Publish the compiled Vite application as `ghcr.io/five2seven/stackmap` in a non-root nginx container on port `8080`. Support Portainer through a copy-and-paste Stack definition and developers through a repository `compose.yaml`. Keep the root filesystem read-only with only nginx's `/tmp` runtime path writable. Do not add an application-data volume, backend, or server-side database. Inventory remains in browser IndexedDB and JSON export remains the backup mechanism.

**Consequences:** Container recreation and image upgrades at an unchanged URL normally preserve browser-local inventory, but Docker volumes cannot back it up. Each browser and origin has independent data; changing hostname, IP address, protocol, or port may show an empty inventory. Reverse proxies terminate TLS and must preserve a stable canonical URL. GHCR publishing is independent of the existing Cloudflare Pages deployment.

## ADR-006: Durable self-hosted SQLite application

**Status:** Accepted

**Date:** 2026-08-03

**Context:** StackMap is intended to behave like a durable self-hosted Docker application. The browser-origin storage selected by ADR-005 does not support normal Docker and NAS backups, shared multi-browser or multi-device access, resilience to browser-data clearing or URL changes, reliable long-term operation, or the expected `/config` volume model.

**Decision:** Move StackMap to a Node.js and TypeScript server using Fastify and SQLite at `/config/stackmap.db`. Keep a single-container self-hosted deployment, with browser clients using a same-origin API. Retain the React frontend. Retain IndexedDB temporarily only as the source for an explicit legacy migration; it will not remain a normal primary datastore after the coordinated cutover.

**Consequences:** A backend and persistent application-data bind mount are required. Cloudflare Pages can no longer represent the full production product. Database migrations, bind-mount permissions, backup procedures, and upgrade compatibility become product responsibilities. The React UI and most domain behavior can remain. Existing IndexedDB users require an explicit, data-safe migration path.

## ADR-007: Retire the legacy IndexedDB migration boundary

**Status:** Accepted

**Date:** 2026-08-05

**Context:** Task 6 provided a temporary, explicit migration path from exact legacy browser schema version 3 into an empty SQLite inventory. Task 7 ends that compatibility window after SQLite became the sole production-authoritative datastore.

**Decision:** Remove all IndexedDB and Dexie application access, the browser migration user interface, and the legacy migration API. Do not delete or modify browser data. Keep database migration 3 and its receipt table unchanged so databases produced during Task 6 continue to open normally. Preserve server backup and restore and JSON import compatibility.

**Consequences:** StackMap starts directly from the same-origin HTTP API and SQLite regardless of browser-local data. Operators who did not complete migration must recover legacy data with a compatible older release or an existing JSON export. Completed Task 6 data remains authoritative and usable, but no new browser migration can be initiated by the current application.

## New decision template

Copy this section for future decisions:

```text
## ADR-NNN: Decision title

Status:
Context:
Decision:
Consequences:
```

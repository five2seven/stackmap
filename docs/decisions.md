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
- status
- hostId
- internalUrl
- ports
- configPath
- dataPath
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
- Host assignment is optional.
- A service may use multiple ports.
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

### Deletion Behavior

- Services may be permanently deleted only after confirmation.
- Retired services remain stored.
- Hosts cannot be deleted while services reference them unless the user first reassigns or removes those references.

### Rationale

This model keeps the MVP simple while still supporting duplicate-port detection, filtering, dependencies, incomplete records, and future migration.

## New decision template

Copy this section for future decisions:

```text
## ADR-NNN: Decision title

Status:
Context:
Decision:
Consequences:
```

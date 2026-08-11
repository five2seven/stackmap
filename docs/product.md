# Product

## Summary

`StackMap` is described as:

> A self-hosted homelab inventory and planning application

## Primary User

StackMap is initially designed for technically capable homelab hobbyists who enjoy self-hosting, experimenting with software, and building their own infrastructure.

The primary user is comfortable with tools such as Docker, Docker Compose, Plex, Jellyfin, Sonarr, Radarr, Home Assistant, Portainer, Tailscale, and similar self-hosted applications. They may work in technology professionally, but they are not necessarily software developers or infrastructure engineers.

They typically have limited free time and several partially completed projects. Their homelab has grown gradually, and important information may be scattered across many sources.

They may understand the value of documentation but are unlikely to maintain a system that requires extensive setup or frequent administrative work.

StackMap should therefore be:

- Fast to begin using
- Useful with incomplete information
- Easy to update
- Easy to understand after a long absence
- Structured without demanding perfect documentation
- Helpful for both active services and unfinished plans

## Core Problem

Homelab users often lose track of which services are running, which ports are already assigned, where configuration and data are stored, and how services connect because that information is scattered across configuration files, notes, bookmarks, spreadsheets, screenshots, and memory.

This becomes more difficult as the homelab grows gradually over time. Services are added, changed, moved, or abandoned, but the documentation rarely stays current.

StackMap should solve this by giving the user one clear place to understand what exists, how it is configured, and how the pieces relate to each other.

## Core Experience

A user opens StackMap and sees a clear overview of their homelab.

They can add or update a service quickly, even when they do not have every detail available.

For each service, they should be able to understand:

- Where it runs
- Which ports it uses
- Where configuration and data are stored
- Whether it is exposed outside the local network
- Which other services it depends on

The core value is not only storing information. StackMap should help the user return after days or months and quickly understand how their environment is organized without reconstructing it from scattered sources.

## Core Service Information

The MVP should allow the user to record the following information for each service:

- Service name
- Optional description
- Optional container name and Docker image
- Optional application URL for the user-facing address
- Status: active, planned, paused, or retired
- Host or device where it runs
- Internal hostname or IP address, kept distinct from the application URL
- Ports
- Zero or more Docker path mappings, each with host path, container path, purpose, and read-only status
- Docker network
- External exposure: local only, VPN, reverse proxy, or public
- Dependencies on other services
- Notes

Only the service name should be required when initially creating a record.

The user should be able to save incomplete information and return later to add more detail. StackMap should not block progress because the user does not currently know every value.

## MVP Features

The first useful version of StackMap should include:

- A service list showing all documented services
- A dedicated Port Map grouped by host, including an Unassigned host group, host filtering, conflict details, and edit-from-map actions
- A dedicated Path Map grouped by host and host path, including shared-path details, existing warnings, host filtering, and edit-from-map actions
- The ability to add a service
- The ability to edit a service
- The ability to delete or retire a service
- Search across service names, hosts, ports, paths, networks, and notes
- Filters for status, host, Docker network, and external exposure
- Port Map search across service identity, host, host port, container port, and protocol
- Detection of duplicate port assignments
- Detection of duplicate non-retired container names on the same host
- Warnings for incomplete mappings, mixed path styles, and missing configuration-purpose mappings
- Clear indication when a service record is incomplete
- Shared server-authoritative storage without an account or external service
- JSON export for backup and portability
- Explicit server backup and restore

The MVP should prioritize fast entry, clear organization, and useful warnings over visual complexity.

The Port Map preserves incomplete entries and identifies missing host ports, container ports, protocols, and host assignments. It intentionally does not provide network or protocol filters, port recommendations, or automatic conflict resolution.

The Path Map preserves blank and partial mappings, groups conservatively without changing stored paths, and identifies same-host sharing across distinct services. It reuses existing mapping and service path warnings and intentionally does not rewrite paths, enforce cross-service consistency, or provide automatic correction.

## Self-Hosted Deployment

Portainer Stack deployment from the published `ghcr.io/five2seven/stackmap` image is a supported distribution method. End users paste the documented image-based Compose stack into Portainer and do not need a repository clone. Source-based Docker Compose remains available for developers.

The container runs one non-root Node.js process that serves the React application and same-origin API. SQLite at `/config/stackmap.db` is authoritative for inventory, and a persistent `/config` bind mount keeps application data across container restarts, recreation, and upgrades. Operators should include `/config` in normal Docker or NAS backup procedures.

Browsers and devices connected to the same StackMap server share its SQLite inventory. Normal reads and writes use only the same-origin HTTP API; there is no browser fallback, dual write, or synchronization boundary.

IndexedDB and Dexie are retired from the application. StackMap does not enumerate, read, modify, migrate, or delete browser-local data. The legacy migration UI and API are also retired. Inventory migrated into SQLite by the earlier migration workflow remains normal authoritative inventory, and its migration receipt remains compatible with current database startup, backup, restore, restart, and recreation behavior.

Users can download a versioned JSON backup of the server inventory and explicitly preview and confirm a complete server restore. Restore operates only on authoritative SQLite inventory and does not inspect or modify browser storage.

## Public Demo

The public Cloudflare Pages site is a separate, clearly labeled demonstration with bundled sample data.
It uses an in-memory repository only: edits survive within the current page session and reset on refresh.
It does not call the production API, access SQLite or IndexedDB, use Web Storage, upload visitor data, or
offer server backup and restore. It is not a hosted edition of StackMap and does not change the
self-hosted product's SQLite authority.

## MVP Non-Goals

The MVP will not include:

- Automatic Docker discovery
- Direct connections to Docker hosts
- Container monitoring
- Service health checks
- Alerts or notifications
- Starting, stopping, or restarting containers
- User accounts
- Cloud synchronization
- Multi-user collaboration
- Mobile apps
- Subscription billing
- AI-generated recommendations
- Reverse proxy configuration
- Secrets or credential storage
- Automatic import from Docker Compose files
- Infrastructure diagrams generated from live systems
- Authentication or external persistence services
- Automatic container updates

These may be considered later, but they are intentionally excluded so the self-hosted product remains focused, easy to operate, and easy to test.

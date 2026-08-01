# Product

## Summary

`StackMap` is described as:

> A local-first homelab planning application

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
- Configuration path
- Data path
- Docker network
- External exposure: local only, VPN, reverse proxy, or public
- Dependencies on other services
- Notes

Only the service name should be required when initially creating a record.

The user should be able to save incomplete information and return later to add more detail. StackMap should not block progress because the user does not currently know every value.

## MVP Features

The first useful version of StackMap should include:

- A service list showing all documented services
- The ability to add a service
- The ability to edit a service
- The ability to delete or retire a service
- Search across service names, hosts, ports, paths, networks, and notes
- Filters for status, host, Docker network, and external exposure
- Detection of duplicate port assignments
- Detection of duplicate non-retired container names on the same host
- Clear indication when a service record is incomplete
- Local storage so the app works without an account or hosted backend
- JSON export for backup and portability
- JSON import for restore or migration

The MVP should prioritize fast entry, clear organization, and useful warnings over visual complexity.

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

These may be considered later, but they are intentionally excluded so the MVP remains local-first, easy to build, and easy to test.

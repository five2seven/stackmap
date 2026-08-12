# StackMap

StackMap is a self-hosted homelab inventory and planning application for documenting Docker services, hosts, ports, paths, networks, exposure, and dependencies.

## What StackMap Does

Homelab details often end up scattered across Compose files, notes, bookmarks, spreadsheets, and memory. StackMap provides one structured place to record what runs where, how services are connected, which ports and paths they use, and where configuration may be incomplete.

Only a service name is required, so incomplete plans can be recorded and refined later. StackMap does not require an account or external service.

The production application is the self-hosted container described below. A separate public demo is live
at [stackmap.rareobjectlabs.app](https://stackmap.rareobjectlabs.app). It contains bundled sample data
only: edits remain in memory for the current page session and reset on refresh, with no StackMap server
connection or user-data upload.

## Features

- Host and service inventories
- Optional container names, Docker images, descriptions, application URLs, and internal addresses
- Multiple port and path mappings per service
- Service dependencies, Docker networks, and exposure documentation
- Duplicate host-port and active container-name detection
- Warnings for incomplete records and path mappings
- Port Map grouped by host, with search, filtering, conflicts, and edit actions
- Path Map grouped by host and path, with shared-path details, warnings, search, filtering, and edit actions
- Service search and filters for status, host, network, and exposure
- Versioned JSON export of the current server inventory
- Shared durable inventory in SQLite through the same-origin API

## Deploy with Portainer

The production container is published at `ghcr.io/five2seven/stackmap:latest`. Ordinary `main` merges and
tag pushes validate without publishing an image; image publication remains an explicitly dispatched
workflow.

1. Open Portainer.
2. Select **Stacks**.
3. Select **Add stack**.
4. Name the stack `stackmap`.
5. Select **Web editor**.
6. Paste the YAML below.
7. Select **Deploy the stack**.
8. Open `http://<docker-host-ip>:8088`.

```yaml
---
services:
  stackmap:
    image: ghcr.io/five2seven/stackmap:latest
    init: true
    container_name: stackmap
    environment:
      - TZ=Etc/UTC
    ports:
      - "8088:8080"
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:8080/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
      start_period: 20s
      timeout: 3s
      interval: 15s
      retries: 3
    restart: unless-stopped
    read_only: true
    volumes:
      - /path/to/stackmap/config:/config
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
```

StackMap stores its authoritative inventory in `/config/stackmap.db`. Replace `/path/to/stackmap/config` with a writable persistent directory on the Docker host and include that directory in normal host-level backups.

The left side of `"8088:8080"` is the host port. For example, use `"8090:8080"` to expose StackMap on port 8090. Change `TZ=Etc/UTC` to the appropriate IANA timezone for the Docker host.

Browsers and devices using the same StackMap server share its SQLite inventory. StackMap does not access or delete browser-local IndexedDB data. Operators who did not complete the earlier migration workflow must recover that data with a compatible older release or an existing JSON export.

For the complete deployment, permissions, health, backup, restore, upgrade, rollback, and recovery
procedure, see [Deployment and operations](docs/deployment-and-operations.md).

### Updating in Portainer

1. Download a server JSON backup.
2. Stop StackMap cleanly and make a cold backup of the complete `/config` directory.
3. Open the StackMap stack and re-pull the intended image.
4. Update the stack without changing the `/config` mount.
5. Wait for the container to become healthy, then refresh the browser and verify the inventory.

Database schemas migrate forward automatically and transactionally. An image that does not recognize
the mounted database schema exits instead of serving or rewriting inventory; inspect the container log
for the unsupported migration version. Image rollback is safe only when the older image supports the
current database schema. Otherwise, stop StackMap and restore the matching cold `/config` backup before
starting the older image.

## Usage

1. Create the hosts that run or will run homelab services.
2. Add services and assign them to hosts when known.
3. Record ports, paths, networks, exposure, dependencies, and notes.
4. Review the Port Map and Path Map for conflicts, shared paths, and incomplete entries.
5. Resolve useful warnings as information becomes available.
6. Export JSON backups regularly.

## Public Demo

The Cloudflare Pages site is an isolated product demonstration, not a hosted StackMap account or a
deployment option for production inventory. It starts with a bundled sample homelab, clearly labels
itself as a demo, and discards all changes when the page refreshes or closes. It does not use the
production API, SQLite, IndexedDB, `localStorage`, or `sessionStorage`, and it provides no backup upload
or restore controls.

Developers can validate the exact static artifact locally:

```powershell
npm ci
npm run build:demo
npm run test:e2e:demo
```

`npm run build:demo` writes `dist-demo`, copies the Cloudflare Pages SPA redirect, and fails if the
artifact contains known production API, SQLite, IndexedDB, or browser-storage paths. The normal
`npm run build` command still produces the self-hosted HTTP/SQLite application in `dist` and
`dist-server`.

## Data Storage

StackMap stores all normal production inventory in SQLite at `/config/stackmap.db`. The React application reads and writes that inventory only through the same-origin HTTP API. Container restart or recreation with the same `/config` mount preserves inventory, and independent browsers see the same records.

Legacy IndexedDB records remain browser-local and untouched, but StackMap no longer detects, reads, writes, migrates, or deletes them. SQLite remains the only production-authoritative inventory datastore. Databases that already received a completed legacy migration remain compatible and retain their migration receipt metadata.

## Backup and Restore

Use **Download server backup** to save a versioned JSON backup of the authoritative SQLite inventory. The file contains complete hosts and services, including ordered ports, paths, dependencies, IDs, and timestamps; it is not a raw SQLite database file.

To restore, select a server-backup JSON file, preview its summary, read the destructive warning, and explicitly acknowledge replacement. Restore replaces the complete server inventory atomically. If inventory changes after preview, StackMap rejects confirmation and requires a new preview. Keep `/config` persistently mounted so restored data survives container replacement.

The retired browser migration workflow is not part of backup or restore. Server backup and restore continue to operate only on the authoritative SQLite inventory and do not inspect or modify browser storage.

## Import from Portainer

Set `STACKMAP_PORTAINER_URL` to the HTTPS origin of the Portainer server to enable manual import. In the production UI, enter a Portainer API token, select environments and containers, review host, network, port, and bind-mount choices, then explicitly confirm. StackMap performs read-only Portainer discovery and creates the selected records atomically in SQLite. Tokens remain short-lived server memory only.

Portainer import is create-only: it never updates, synchronizes, refreshes, or deletes existing services, and previously imported containers are skipped by default. The public demo has no Portainer integration. Portable JSON backup schema version 1 remains unchanged; a successful full restore clears Portainer repeat-import metadata because restored inventory has no source bindings.

For disaster recovery or image rollback, use a cold filesystem backup: stop the container cleanly, copy
the complete `/config` directory, and then restart it. Copying only `stackmap.db` while StackMap is running
is not a supported backup because SQLite may also have active WAL and shared-memory files. Restore a cold
backup only while the container is stopped. The JSON backup is portable inventory data; unlike a cold
`/config` backup, it does not preserve installation metadata, migration history, or legacy migration
receipt metadata.

If the container does not become healthy after deployment, inspect its logs first. Permission errors mean
the host directory mounted at `/config` is not writable by container UID/GID `10001:10001`; correct the
host permissions rather than moving the database into the container. Unsupported migration errors mean
the image and database versions do not match; use a compatible image or the matching cold backup.

## Build from Source

Portainer deployment from the published image is the primary installation method. Developers can build the production container locally:

The source repository is public and can be cloned without GitHub authentication:

```powershell
git clone https://github.com/five2seven/stackmap.git
cd stackmap
docker compose up -d --build
```

The repository Compose stack uses `http://localhost:8088` and `./config` by default. Set `STACKMAP_PORT`, `STACKMAP_CONFIG_DIR`, or `TZ` in the shell to override these values.

For local development (Vite and the Fastify server run together):

```powershell
npm ci
npm run dev
npm test
```

Additional validation commands are `npm run lint`, `npm run build`, `npm run test:e2e`,
`npm run build:demo`, and `npm run test:e2e:demo`. Install the Playwright Chromium browser with
`npx playwright install chromium` before the first end-to-end test run.

## Current Limitations

- Server-authoritative JSON backup and restore are implemented for exact-shape server backup schema version 1. Restore is manual and destructive, and requires preview plus explicit confirmation; it is not a raw SQLite database-file backup.
- Scheduled, cloud, incremental, partial, and merge backup or restore are not implemented.
- The legacy IndexedDB migration workflow is retired. Browser data remains untouched and must be recovered with a compatible older release or an existing JSON export if it was not migrated earlier.
- There are no user accounts or cloud synchronization.
- StackMap does not connect to or manage remote Docker hosts.
- There is no container monitoring or automatic discovery.
- Docker Compose import is not supported.
- Markdown export is not available yet.
- Docker Compose skeleton export is not available yet.
- Published container images are currently validated for Linux/amd64 only; ARM64 support is not yet validated.

## Development and Contributing

StackMap uses React, TypeScript, Vite, Fastify, better-sqlite3, Vitest, Testing Library, and Playwright. Preserve strict TypeScript checks and run lint, tests, the production build, and relevant end-to-end tests before submitting a change.

Bug reports are welcome through the repository's [Bug Report issue template](https://github.com/five2seven/stackmap/issues/new?template=bug_report.md). StackMap is self-hosted, and support, fixes, and response times are not guaranteed.

More technical context is available in [architecture](docs/architecture.md),
[product documentation](docs/product.md), [architecture decisions](docs/decisions.md),
[deployment and operations](docs/deployment-and-operations.md), and
[release notes](docs/release-notes.md).

## License

StackMap is licensed under the [MIT License](LICENSE).

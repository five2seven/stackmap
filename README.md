# StackMap

StackMap is a local-first homelab inventory and planning application for documenting Docker services, hosts, ports, paths, networks, exposure, and dependencies.

## What StackMap Does

Homelab details often end up scattered across Compose files, notes, bookmarks, spreadsheets, and memory. StackMap provides one structured place to record what runs where, how services are connected, which ports and paths they use, and where configuration may be incomplete.

Only a service name is required, so incomplete plans can be recorded and refined later. StackMap runs entirely in the browser and does not require an account or backend.

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
- Versioned JSON backup and restore with import validation
- Local browser storage through IndexedDB

## Screenshots

Screenshots are not available yet.

## Deploy with Portainer

The container image is prepared for publication at `ghcr.io/five2seven/stackmap`. Confirm that the image is publicly available before deploying; it should not be considered published until the container workflow has completed successfully on `main`.

GitHub Container Registry packages may initially be private. After the first successful publish, open the `stackmap` package on the GitHub organization or user profile, select **Package settings**, choose **Change visibility** under **Danger Zone**, and set it to **Public** before sharing the deployment instructions.

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
      - TZ=America/Chicago
    ports:
      - "8088:8080"
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://127.0.0.1:8080/"]
      start_period: 20s
      timeout: 3s
      interval: 15s
      retries: 3
    restart: unless-stopped
    read_only: true
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
```

StackMap stores inventory data in your browser using IndexedDB, not inside the Docker container. Docker volumes do not back up your StackMap inventory. Use JSON export for backups, and keep the same hostname, protocol, and port when upgrading.

The left side of `"8088:8080"` is the host port. For example, use `"8090:8080"` to expose StackMap on port 8090. Change `TZ=America/Chicago` to the appropriate IANA timezone for the Docker host.

The browser URL is part of the storage identity. Changing the hostname, IP address, protocol, or port creates a different browser origin and may show a separate empty inventory. Other browsers and devices do not automatically share the same data.

### Updating in Portainer

1. Open the StackMap stack.
2. Re-pull the latest image.
3. Update the stack.
4. Keep the same URL when practical.
5. Refresh the browser after the container becomes healthy.

## Usage

1. Create the hosts that run or will run homelab services.
2. Add services and assign them to hosts when known.
3. Record ports, paths, networks, exposure, dependencies, and notes.
4. Review the Port Map and Path Map for conflicts, shared paths, and incomplete entries.
5. Resolve useful warnings as information becomes available.
6. Export JSON backups regularly.

## Data Storage

StackMap stores its inventory in IndexedDB in the current browser. No application inventory database is stored in the container, and no Docker data volume is required. Restarting or recreating the container at the same URL normally leaves browser data intact, but clearing browser site data can delete it.

Data does not synchronize between browsers or devices. Use one stable canonical URL to avoid unintentionally opening a different browser storage origin.

## Backup and Restore

Use **Export JSON** to download a versioned backup containing the complete local dataset. Use **Import JSON** to validate and review a backup before replacing the current browser data.

Docker volumes do not contain or protect the inventory. Export JSON before clearing site data, changing browsers, moving to another device, or changing the URL used to access StackMap.

## Build from Source

Portainer deployment from the published image is the primary installation method. Developers can build the production container locally:

```powershell
git clone https://github.com/five2seven/stackmap.git
cd stackmap
docker compose up -d --build
```

The repository Compose stack uses `http://localhost:8088` by default. Set `STACKMAP_PORT` or `TZ` in the shell to override the host port or timezone.

For frontend development:

```powershell
npm ci
npm run dev
npm test
```

Additional validation commands are `npm run lint`, `npm run build`, and `npm run test:e2e`. Install the Playwright Chromium browser with `npx playwright install chromium` before the first end-to-end test run.

## Current Limitations

- Data is local to one browser origin.
- There are no user accounts or cloud synchronization.
- StackMap does not connect to or manage remote Docker hosts.
- There is no container monitoring or automatic discovery.
- Docker Compose import is not supported.
- Markdown export is not available yet.
- Docker Compose skeleton export is not available yet.

## Development and Contributing

StackMap uses React, TypeScript, Vite, Dexie, Vitest, Testing Library, and Playwright. Keep changes frontend-only unless the architecture explicitly changes, preserve strict TypeScript checks, and run lint, tests, the production build, and relevant end-to-end tests before submitting a change.

More technical context is available in [architecture](docs/architecture.md), [product documentation](docs/product.md), and [architecture decisions](docs/decisions.md).

## License

No license file has been added to this repository. All rights remain with the copyright holder unless a license is added.

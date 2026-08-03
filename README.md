# StackMap

A local-first homelab planning application for documenting services, hosts, ports, paths, networks, exposure, and dependencies.

StackMap stores its primary dataset in IndexedDB in the current browser. No account or hosted backend is required.

## Prerequisites

- Node.js 22 or newer
- npm 10 or newer

## Getting started

```powershell
npm install
npx playwright install chromium
npm run dev
```

Vite prints the local development URL after startup.

## Current functionality

- Create, edit, retire, and permanently delete service records
- Record optional container names, Docker images, descriptions, application URLs, internal hostnames or IPs, hosts, repeatable Docker path mappings, networks, exposure, dependencies, notes, and multiple ports
- Add and edit hosts, assign services to them, and protect referenced hosts from deletion
- Search services and filter by status, host, Docker network, and exposure
- Switch to a dedicated Port Map grouped by host, filter it by host, inspect exact conflict relationships, and edit services from an assignment
- Switch to a dedicated Path Map grouped by host and normalized host path, inspect shared and incomplete mappings, and edit services from a mapping
- Identify incomplete service records, initial path-mapping issues, duplicate host-port assignments, and duplicate active container names on the same host
- Export the complete local dataset to a versioned JSON backup
- Validate and review JSON imports before replacing local data

Only a service name is required when creating a record. Incomplete records are intentionally supported.

The application URL is the address a user opens to reach the application. The internal hostname or IP records the service's internal network address. Container-name conflicts are reported only for non-retired services assigned to the same host; comparison ignores case and surrounding whitespace.

The Port Map is derived from the current service and host records and does not duplicate data in IndexedDB. It groups every port entry by assigned host, places hostless services under **Unassigned host**, sorts numeric host ports first, and searches service identity, host, port, and protocol fields. Conflict details follow the existing same-host protocol-overlap rules, including retired services. Current filters are limited to host and search; the map does not recommend or reassign ports.

The Path Map is also derived in memory, so it requires no IndexedDB or JSON schema migration. It groups mappings by host and trimmed, case-insensitive host path while displaying the stored path unchanged. A host path is marked shared only when distinct services—including retired services under the current policy—use it on the same assigned host. Search covers service identity, host, paths, purpose, and read-only or writable access; existing incomplete, mixed-style, and missing-configuration warnings are reused. Current limitations include no path rewriting, consistency enforcement, graphical topology, or automatic correction.

## Local data and backups

All user-created data remains in the browser for this MVP. Clearing site data or switching browsers does not transfer the dataset. Use **Export JSON** to create a backup before clearing browser data or moving to another browser, and use **Import JSON** to validate and restore that backup.

Each path mapping records a host path, container path, optional purpose, and read-only status. Partial mappings may be saved. StackMap flags incomplete host/container pairs, mixed absolute and relative styles on each side, and services without a purpose containing “config.” It does not yet normalize paths or check sharing across services.

Current exports use JSON schema version 3. Valid version 1 backups receive empty service identity fields and migrated paths; valid version 2 backups migrate `configPath` and `dataPath` into repeatable mappings. Current exports contain only `paths`.

## Available commands

- `npm run dev` starts the Vite development server.
- `npm run build` type-checks and creates a production build in `dist`.
- `npm run lint` checks the codebase with ESLint.
- `npm test` runs the Vitest test suite once.
- `npm run test:watch` runs Vitest in watch mode.
- `npm run test:e2e` runs isolated Chromium end-to-end workflows.
- `npm run test:all` runs lint, Vitest, the production build, and end-to-end tests.

## Deployment foundation

Proof-of-concept deployments follow this convention:

- Registrar: Porkbun
- DNS provider: Cloudflare
- POC hosting: Cloudflare Pages
- Source control: GitHub
- Repository: `five2seven/stackmap`
- POC domain: `stackmap.rareobjectlabs.app`

Cloudflare configuration, DNS records, and deployment setup are managed separately from the application.

## Self-hosting with Docker

Portainer is the primary self-hosted deployment path. The container image is prepared for publication at `ghcr.io/five2seven/stackmap`; do not assume it is available until the **Build and publish container image** workflow has completed successfully on `main`.

### Portainer deployment

1. Open Portainer.
2. Select **Stacks**.
3. Select **Add stack**.
4. Enter `stackmap` as the stack name.
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

> StackMap currently stores inventory data in your browser using IndexedDB, not inside the Docker container. Docker volumes do not back up your StackMap inventory. Use JSON export for backups, and keep the same hostname, protocol, and port when upgrading.

This stack needs no repository clone, `.env` file, or application-data volume. The image runs nginx as a non-root user on internal HTTP port `8080`; `/tmp` is its only writable runtime path. `wget` is included in the runtime image and the health check succeeds only when nginx serves the root page.

To use another host port, change the left side of the mapping. For example, use `"8090:8080"` and then open port 8090. Change `TZ=America/Chicago` to an appropriate [IANA time zone](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones) for the Docker host.

For a shorter setup without the explicit hardening options, use:

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
```

### Updating in Portainer

1. Open the StackMap stack.
2. Enable image re-pull or choose the option to re-pull the image.
3. Select **Update the stack**.
4. Keep the same hostname, protocol, and port when practical.
5. Refresh the browser after the new image becomes healthy.

Recreating, restarting, or updating the container at the same browser URL normally preserves inventory because it remains in that browser's IndexedDB. Clearing site data can delete it. Another browser or device does not automatically share the inventory, and changing the hostname, IP address, protocol, or port creates a different browser storage origin that may appear empty. Keep one stable canonical URL and use **Export JSON** for backups.

### Build from source

Developers can build the same production image with the repository Compose file:

```powershell
git clone https://github.com/five2seven/stackmap.git
cd stackmap
docker compose up -d --build
```

The default address is `http://localhost:8088`. Set `STACKMAP_PORT` or `TZ` in the shell before running Compose to override the host port or timezone. The helper `./scripts/stackmap-docker.ps1` starts the stack and waits for health; run `./scripts/stackmap-docker.ps1 -Action Stop` to remove only this Compose stack's container and network.

### Container image publication

The container workflow builds and smoke-tests pull requests without publishing them. Pushes to `main` publish `latest` and an immutable `sha-<shortsha>` tag for `linux/amd64`; version tags such as `v1.2.3` publish `1.2.3` and a commit tag. It uses GitHub's repository-scoped `GITHUB_TOKEN`, so no registry password is stored in the repository. The existing Cloudflare Pages workflow remains independent.

If the first GHCR package is private, open the package on the GitHub organization or user profile, select **Package settings**, scroll to **Danger Zone**, choose **Change visibility**, and set it to **Public**. Confirm the package is publicly pullable before directing users to the Portainer example.

### Reverse proxies

Terminate TLS at the reverse proxy and forward traffic to port `8080` in the container (or the chosen host port). StackMap has no backend API routes and currently needs no WebSocket forwarding. Use one stable canonical URL: switching between HTTP and HTTPS, changing the hostname, or changing the port changes the browser origin and therefore which IndexedDB inventory the browser opens. No vendor-specific proxy configuration is required by the container.

## Cloudflare Pages deployment

Production deployment uses Cloudflare Pages Direct Upload through Wrangler. The GitHub Actions workflow runs on pushes to `main` and through manual workflow dispatch. It installs dependencies and Chromium, runs lint and all tests, builds the application, and deploys `dist` to the `stackmap` Pages project.

### Required credentials

Create a Cloudflare API token with permission to edit Cloudflare Pages for the target account. Store the account ID and API token only as GitHub Actions repository secrets named:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

The same environment variable names are required by the local PowerShell scripts. The scripts verify that both variables exist and never print their values.

### First deployment

Install the locked dependencies:

```powershell
npm ci
npx playwright install chromium
```

Set the credentials in the current PowerShell process without writing them to a file:

```powershell
$env:CLOUDFLARE_ACCOUNT_ID = Read-Host 'Cloudflare account ID'
$cloudflareToken = Read-Host 'Cloudflare API token' -AsSecureString
$env:CLOUDFLARE_API_TOKEN = [System.Net.NetworkCredential]::new('', $cloudflareToken).Password
```

Validate the application, create the `stackmap` Pages project if needed, and deploy `dist`:

```powershell
.\scripts\deploy-cloudflare.ps1
```

Attach the intended custom domain only after the Pages deployment succeeds:

```powershell
.\scripts\configure-cloudflare-domain.ps1 `
  -ProjectName 'stackmap' `
  -DomainName 'stackmap.rareobjectlabs.app'
```

The domain script checks the project’s existing Pages domains before adding anything. It does not call the DNS Records API or overwrite unrelated DNS records.

### Enable GitHub Actions deployment

Add both repository secrets interactively so their values are not included in shell history:

```powershell
gh secret set CLOUDFLARE_ACCOUNT_ID
gh secret set CLOUDFLARE_API_TOKEN
```

After the Pages project exists, push to `main` or run the **Deploy Cloudflare Pages** workflow manually. The workflow deploys only after lint, tests, and the production build succeed.

## Project structure

```text
src/                  React application and tests
  components/         Service, host, and import UI components
  data/               IndexedDB repository and JSON portability
  domain/             Types, validation, filtering, and warnings
e2e/                  Isolated Playwright browser workflows
scripts/              Repeatable Cloudflare deployment helpers
.github/workflows/    GitHub Actions deployment workflow
docs/                 Product, architecture, and decision records
index.html             Vite HTML entry point
vite.config.ts         Vite and Vitest configuration
eslint.config.js       ESLint flat configuration
```

# Deployment and Operations

## Production boundary

StackMap production is one self-hosted Linux container running one non-root Node.js 24/Fastify process.
It serves the React frontend and same-origin `/api/v1` routes, with SQLite authoritative at
`/config/stackmap.db`. Persist the complete `/config` directory on the host. The Cloudflare Pages site is
an in-memory public demo and is not a production deployment option.

The published image target is `ghcr.io/five2seven/stackmap`. Confirm the requested tag exists and the
package is public before deployment. Current automated image validation covers Linux/amd64; ARM64 is not
yet validated.

## Portainer deployment

Use the image-based Stack in the README. Replace `/path/to/stackmap/config` with an existing persistent
host directory that the container identity `10001:10001` can write. Preserve the `/config` mount across
all updates and recreations. The container listens on port `8080`; the example publishes host port `8088`.

After deployment, wait for the health check and open `http://<docker-host-ip>:8088`. If the container
does not become healthy, inspect its logs before changing files or mounts:

```powershell
docker logs stackmap
docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' stackmap
```

Permission or read-only errors mean the host directory mounted at `/config` is not writable by
`10001:10001`. Correct host ownership or permissions; do not move the database into the ephemeral
container filesystem.

## Source deployment

The repository Compose file builds the local image, publishes `8088:8080`, and binds `./config` by
default:

```powershell
git clone https://github.com/five2seven/stackmap.git
cd stackmap
docker compose up --detach --build
docker compose ps
```

Set `STACKMAP_PORT`, `STACKMAP_CONFIG_DIR`, or `TZ` in the shell to override the defaults. The helper
`./scripts/stackmap-docker.ps1` performs the same build/start flow and waits for health.

## Portable JSON backup and restore

Use **Download server backup** for a portable export of complete inventory. Server backup schema version
1 contains hosts, services, ordered ports and paths, dependency IDs, source IDs and timestamps, and
informational source metadata. It does not contain SQLite migration history, the target installation
identity, filesystem state, or legacy migration receipts.

Restore is manual, destructive, and replace-only. Preview validates the complete file without mutation;
confirmation requires explicit acknowledgement and the inventory revision observed during preview. A
stale, malformed, duplicate, referentially invalid, or unsupported backup fails closed. Successful restore
replaces the inventory atomically and advances the target inventory revision once. Merge, partial,
scheduled, incremental, and cloud restore are not supported.

## Cold `/config` backup and recovery

For disaster recovery and image rollback, back up the full stopped `/config` directory:

1. Stop the container cleanly and wait for exit.
2. Copy the complete host directory mounted at `/config`, including SQLite WAL or shared-memory files if
   present.
3. Restart the container.

Do not copy only a live `stackmap.db`; that is not a supported consistent backup boundary. To recover,
stop the container, restore the complete matching `/config` backup, verify ownership for `10001:10001`,
then start the compatible image and wait for health.

## Upgrade and rollback

Before an upgrade, download a JSON backup and create a cold `/config` backup. Pull the intended image,
recreate the container without changing the mount, wait for health, then verify inventory from the UI.
Database migrations run forward, transactionally, at startup. Unknown migration versions cause startup
to fail without serving or rewriting inventory.

Rollback is not a reverse database migration. An older image can start only if it recognizes the current
schema; otherwise restore the cold `/config` backup made for that image before starting it. Never force an
older image against an unsupported database.

## Legacy browser data

Current StackMap does not enumerate, read, write, migrate, synchronize, or delete IndexedDB. Data that
was migrated previously is ordinary SQLite inventory. Unmigrated browser data requires a compatible older
release or an existing JSON export; there is no current in-place legacy migration endpoint.

## Public demo operation

The demo is built with `npm run build:demo` into `dist-demo` and tested with
`npm run test:e2e:demo`. Direct upload uses:

```powershell
npx wrangler pages deploy dist-demo --project-name=stackmap --branch=main
```

The repository workflow and `scripts/deploy-cloudflare.ps1` require `CLOUDFLARE_ACCOUNT_ID` and
`CLOUDFLARE_API_TOKEN`. They validate the demo before upload. The artifact includes `public-demo/_redirects`
for SPA routing and contains no production API, SQLite, IndexedDB, or Web Storage runtime. Do not add
Pages Functions, bindings, remote storage, or user-data upload without a separately approved architecture
change.

The command follows Cloudflare Pages
[Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/) guidance. Treat the
planned custom hostname as unpublished until both the Pages deployment and TLS endpoint are healthy.

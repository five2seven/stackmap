#!/usr/bin/env bash
set -euo pipefail

image="${1:-stackmap:validation}"
root="$(mktemp -d)"
container="stackmap-deployment-validation"
portainer_container="stackmap-portainer-validation"
network="stackmap-portainer-validation"
port="18088"

log() { printf '\n==> %s\n' "$1"; }

cleanup() {
  exit_code=$?
  trap - EXIT
  if [ "$exit_code" -ne 0 ]; then
    docker ps -a --filter "name=^/${container}$" --no-trunc || true
    docker logs "$container" 2>/dev/null || true
    find "$root" -maxdepth 2 -printf '%M %u:%g %p\n' 2>/dev/null || true
  fi
  docker rm --force "$container" >/dev/null 2>&1 || true
  docker rm --force "$portainer_container" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  chmod -R u+rwX "$root" 2>/dev/null || true
  rm -rf "$root"
  exit "$exit_code"
}
trap cleanup EXIT

run_container() {
  local config="$1"
  local portainer_url="${2:-http://stackmap-portainer-validation:9000}"
  docker rm --force "$container" >/dev/null 2>&1 || true
  docker run --detach --name "$container" --init --read-only --tmpfs /tmp \
    --cap-drop ALL --security-opt no-new-privileges:true \
    --network "$network" \
    --mount "type=bind,source=$config,target=/config" \
    --mount "type=bind,source=$root/portainer-cert.pem,target=/tmp/portainer-cert.pem,readonly" \
    --env NODE_EXTRA_CA_CERTS=/tmp/portainer-cert.pem \
    --env STACKMAP_PORTAINER_URL="$portainer_url" \
    --publish "${port}:8080" "$image" >/dev/null
}

wait_for_health() {
  for _ in {1..40}; do
    state="$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null || true)"
    health="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container" 2>/dev/null || true)"
    [ "$health" = healthy ] && return 0
    case "$state:$health" in exited:*|dead:*|*:unhealthy) return 1 ;; esac
    sleep 2
  done
  return 1
}

meta_value() {
  local key="$1"
  docker exec "$container" node -e "const D=require('better-sqlite3');const d=new D('/config/stackmap.db',{readonly:true});process.stdout.write(String(d.prepare('SELECT value FROM application_metadata WHERE key=?').pluck().get('$key')));d.close()"
}

log "Validate Portainer/Compose deployment contract"
docker network create "$network" >/dev/null
openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -keyout "$root/portainer-key.pem" -out "$root/portainer-cert.pem" \
  -subj '/CN=stackmap-portainer-validation' \
  -addext 'subjectAltName=DNS:stackmap-portainer-validation' >/dev/null 2>&1
chmod 0644 "$root/portainer-key.pem" "$root/portainer-cert.pem"
docker run --detach --name "$portainer_container" --read-only --tmpfs /tmp --network "$network" \
  --entrypoint node \
  --mount "type=bind,source=$(pwd)/scripts/fake-portainer-server.mjs,target=/app/fake-portainer-server.mjs,readonly" \
  --mount "type=bind,source=$root/portainer-cert.pem,target=/run/portainer-cert.pem,readonly" \
  --mount "type=bind,source=$root/portainer-key.pem,target=/run/portainer-key.pem,readonly" \
  --env FAKE_PORTAINER_CERT=/run/portainer-cert.pem --env FAKE_PORTAINER_KEY=/run/portainer-key.pem \
  "$image" /app/fake-portainer-server.mjs >/dev/null
STACKMAP_PORT=18089 STACKMAP_CONFIG_DIR="$root/compose-config" TZ=UTC docker compose config --format json >"$root/compose.json"
COMPOSE_FILE="$root/compose.json" node <<'NODE'
const assert = require('node:assert/strict')
const config = require(process.env.COMPOSE_FILE)
const service = config.services.stackmap
assert.deepEqual(service.cap_drop, ['ALL'])
assert.equal(service.read_only, true)
assert.equal(service.init, true)
assert.deepEqual(service.security_opt, ['no-new-privileges:true'])
assert.equal(service.restart, 'unless-stopped')
assert.equal(service.user, undefined)
assert.equal(service.environment.STACKMAP_DB_PATH, '/config/stackmap.db')
assert.equal(service.environment.TZ, 'UTC')
assert.ok(service.volumes.some((volume) => volume.target === '/config' && volume.type === 'bind'))
assert.ok(service.tmpfs.some((entry) => entry === '/tmp'))
assert.ok(service.ports.some((entry) => entry.published === '18089' && entry.target === 8080))
assert.ok(service.healthcheck)
NODE

log "Reject non-RFC1918 Portainer HTTP at startup"
rejected="$root/rejected-http"
mkdir "$rejected"
chmod 0777 "$rejected"
run_container "$rejected" "http://127.0.0.1:9000"
if wait_for_health; then echo 'loopback Portainer HTTP unexpectedly became healthy' >&2; exit 1; fi
test "$(docker inspect --format='{{.State.ExitCode}}' "$container")" != 0
docker logs "$container" >"$root/rejected-http.log" 2>&1
grep --quiet 'must resolve exclusively to RFC1918 IPv4 addresses' "$root/rejected-http.log"
docker exec "$portainer_container" node -e "const f=require('node:fs');if(f.existsSync('/tmp/request-history.jsonl')&&f.statSync('/tmp/request-history.jsonl').size)process.exit(1)"

log "Validate forward migration from a Task 1 database"
upgrade="$root/upgrade"
mkdir "$upgrade"
chmod 0777 "$upgrade"
docker run --rm --user 10001:10001 --mount "type=bind,source=$upgrade,target=/config" "$image" \
  node --input-type=module -e "import D from 'better-sqlite3';import {databaseMigrations,runMigrations} from './dist-server/database.js';const d=new D('/config/stackmap.db');runMigrations(d,databaseMigrations.slice(0,1));d.prepare(\"UPDATE application_metadata SET value='task-1-installation' WHERE key='installation_id'\").run();d.close()"
run_container "$upgrade"
wait_for_health
test "$(meta_value installation_id)" = task-1-installation
test "$(docker exec "$container" node -e "const D=require('better-sqlite3');const d=new D('/config/stackmap.db',{readonly:true});process.stdout.write(String(d.prepare('SELECT MAX(version) FROM schema_migrations').pluck().get()));d.close()")" = 4
test "$(meta_value inventory_revision)" = 0

log "Validate real Portainer import, provenance, and persistence"
curl --fail --silent --show-error -H 'content-type: application/json' \
  --data '{"apiToken":"container-api-token"}' "http://127.0.0.1:${port}/api/v1/portainer/sessions" >"$root/portainer-session.json"
SESSION_FILE="$root/portainer-session.json" node <<'NODE' >"$root/portainer-preview-request.json"
const session = require(process.env.SESSION_FILE).data
process.stdout.write(JSON.stringify({ sessionToken: session.sessionToken, environmentIds: [1] }))
NODE
curl --fail --silent --show-error -H 'content-type: application/json' --data-binary @"$root/portainer-preview-request.json" \
  "http://127.0.0.1:${port}/api/v1/portainer/previews" >"$root/portainer-preview.json"
PREVIEW_FILE="$root/portainer-preview.json" node <<'NODE' >"$root/portainer-confirm.json"
const preview = require(process.env.PREVIEW_FILE).data
process.stdout.write(JSON.stringify({
  previewToken: preview.previewToken,
  expectedInventoryRevision: preview.expectedInventoryRevision,
  selectedServices: [{ ...preview.services[0], ports: preview.services[0].ports.slice(0, 1), paths: preview.services[0].paths.slice(0, 1) }],
  acknowledged: true,
}))
NODE
curl --fail --silent --show-error -H 'content-type: application/json' --data-binary @"$root/portainer-confirm.json" \
  "http://127.0.0.1:${port}/api/v1/portainer/imports" >"$root/portainer-import.json"
docker exec "$portainer_container" cat /tmp/request-history.jsonl >"$root/request-history.jsonl"
REQUEST_HISTORY="$root/request-history.jsonl" node <<'NODE'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const requests = fs.readFileSync(process.env.REQUEST_HISTORY, 'utf8').trim().split('\n').map(JSON.parse)
const normalized = requests
  .map(({ method, url, host, apiKeyAccepted }) => ({ method, url, host, apiKeyAccepted }))
  .sort((left, right) => left.url.localeCompare(right.url))
const expected = [
  '/api/endpoints',
  '/api/endpoints/1/docker/info',
  '/api/endpoints/1/docker/version',
  '/api/endpoints/1/docker/containers/json?all=true',
].map((url) => ({ method: 'GET', url, host: 'stackmap-portainer-validation:9000', apiKeyAccepted: true }))
  .sort((left, right) => left.url.localeCompare(right.url))
assert.deepEqual(normalized, expected)
NODE
docker exec --interactive "$container" node <<'NODE'
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const db = new Database('/config/stackmap.db', { readonly: true })
for (const [table, count] of Object.entries({ hosts: 1, services: 1, service_ports: 1, service_paths: 1, portainer_sources: 1, portainer_host_bindings: 1, portainer_container_bindings: 1 })) {
  assert.equal(db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get(), count, table)
}
assert.equal(db.prepare("SELECT value FROM application_metadata WHERE key='inventory_revision'").pluck().get(), '1')
db.close()
NODE
curl --fail --silent --show-error -H 'content-type: application/json' \
  --data '{"apiToken":"container-api-token"}' "http://127.0.0.1:${port}/api/v1/portainer/sessions" >"$root/portainer-repeat-session.json"
SESSION_FILE="$root/portainer-repeat-session.json" node <<'NODE' >"$root/portainer-repeat-preview-request.json"
const session = require(process.env.SESSION_FILE).data
process.stdout.write(JSON.stringify({ sessionToken: session.sessionToken, environmentIds: [1] }))
NODE
curl --fail --silent --show-error -H 'content-type: application/json' --data-binary @"$root/portainer-repeat-preview-request.json" \
  "http://127.0.0.1:${port}/api/v1/portainer/previews" >"$root/portainer-repeat-preview.json"
REPEAT_FILE="$root/portainer-repeat-preview.json" node <<'NODE'
const assert = require('node:assert/strict')
const service = require(process.env.REPEAT_FILE).data.services[0]
assert.equal(service.alreadyBound, true)
assert.ok(service.conflicts.some(({ code, blocking }) => code === 'ALREADY_BOUND' && blocking))
NODE
docker restart "$container" >/dev/null
wait_for_health
test "$(docker exec "$container" node -e "const D=require('better-sqlite3');const d=new D('/config/stackmap.db',{readonly:true});process.stdout.write(String(d.prepare('SELECT COUNT(*) FROM portainer_container_bindings').pluck().get()));d.close()")" = 1
docker rm --force "$container" >/dev/null
run_container "$upgrade"
wait_for_health
test "$(docker exec "$container" node -e "const D=require('better-sqlite3');const d=new D('/config/stackmap.db',{readonly:true});process.stdout.write(String(d.prepare('SELECT COUNT(*) FROM portainer_container_bindings').pluck().get()));d.close()")" = 1
curl --fail --silent --show-error "http://127.0.0.1:${port}/api/v1/backup" >"$root/portainer-backup.json"
curl --fail --silent --show-error -H 'content-type: application/json' --data-binary @"$root/portainer-backup.json" \
  "http://127.0.0.1:${port}/api/v1/restore/preview" >"$root/portainer-restore-preview.json"
RESTORE_FILE="$root/portainer-restore-preview.json" node <<'NODE' >"$root/portainer-restore-confirm.json"
const preview = require(process.env.RESTORE_FILE).data
process.stdout.write(JSON.stringify({ previewToken: preview.previewToken, expectedInventoryRevision: preview.expectedInventoryRevision }))
NODE
curl --fail --silent --show-error -H 'content-type: application/json' --data-binary @"$root/portainer-restore-confirm.json" \
  "http://127.0.0.1:${port}/api/v1/restore/confirm" >/dev/null
test "$(docker exec "$container" node -e "const D=require('better-sqlite3');const d=new D('/config/stackmap.db',{readonly:true});process.stdout.write(String(d.prepare('SELECT COUNT(*) FROM portainer_sources').pluck().get()));d.close()")" = 0

log "Validate concurrent-client conflict handling"
timestamp='2026-08-09T00:00:00.000Z'
printf '{"id":"concurrent-host","name":"Original","type":"nas","ipAddress":"192.0.2.20","operatingSystem":"Linux","notes":"","createdAt":"%s","updatedAt":"%s"}' "$timestamp" "$timestamp" >"$root/host.json"
curl --fail --silent --show-error -H 'content-type: application/json' --data-binary @"$root/host.json" "http://127.0.0.1:${port}/api/v1/hosts" >/dev/null
HOST_FILE="$root/host.json" node -e "const fs=require('node:fs');const h=require(process.env.HOST_FILE);fs.writeFileSync(process.env.HOST_FILE,JSON.stringify({expectedRevision:1,host:{...h,name:'Client update',updatedAt:'2026-08-09T00:00:01.000Z'}}))"
curl --silent --show-error -o "$root/update-a.json" -w '%{http_code}' -X PUT -H 'content-type: application/json' --data-binary @"$root/host.json" "http://127.0.0.1:${port}/api/v1/hosts/concurrent-host" >"$root/status-a" &
pid_a=$!
curl --silent --show-error -o "$root/update-b.json" -w '%{http_code}' -X PUT -H 'content-type: application/json' --data-binary @"$root/host.json" "http://127.0.0.1:${port}/api/v1/hosts/concurrent-host" >"$root/status-b" &
pid_b=$!
wait "$pid_a" "$pid_b"
statuses="$(sort "$root/status-a" "$root/status-b" | tr '\n' ' ')"
test "$statuses" = '200 409 '
grep --quiet 'REVISION_CONFLICT' "$root/update-a.json" "$root/update-b.json"

log "Validate cold /config backup and restore"
installation="$(meta_value installation_id)"
revision="$(meta_value inventory_revision)"
docker stop --time 15 "$container" >/dev/null
docker logs "$container" >"$root/shutdown.log" 2>&1
grep --quiet 'graceful shutdown started' "$root/shutdown.log"
grep --quiet 'graceful shutdown completed' "$root/shutdown.log"
mkdir "$root/cold-restore"
cp -a "$upgrade/." "$root/cold-restore/"
chmod 0777 "$root/cold-restore"
docker run --rm --user 0:0 --mount "type=bind,source=$root/cold-restore,target=/config" "$image" \
  chown -R 10001:10001 /config
run_container "$root/cold-restore"
wait_for_health
test "$(meta_value installation_id)" = "$installation"
test "$(meta_value inventory_revision)" = "$revision"
curl --fail --silent --show-error "http://127.0.0.1:${port}/api/v1/hosts/concurrent-host" | grep --quiet 'Client update'

log "Validate unsupported-schema upgrade fails closed"
docker stop --time 15 "$container" >/dev/null
docker run --rm --user 10001:10001 --mount "type=bind,source=$root/cold-restore,target=/config" "$image" \
  node -e "const D=require('better-sqlite3');const d=new D('/config/stackmap.db');d.prepare('INSERT INTO schema_migrations(version,name,checksum,applied_at) VALUES(999,?,?,?)').run('future schema','future','2026-08-09T00:00:00.000Z');d.close()"
before="$(docker run --rm --mount "type=bind,source=$root/cold-restore,target=/config" "$image" node -e "const D=require('better-sqlite3');const d=new D('/config/stackmap.db',{readonly:true});process.stdout.write(JSON.stringify({hosts:d.prepare('SELECT * FROM hosts ORDER BY id').all(),revision:d.prepare(\"SELECT value FROM application_metadata WHERE key='inventory_revision'\").pluck().get(),migrations:d.prepare('SELECT version,name,checksum,applied_at FROM schema_migrations ORDER BY version').all()}));d.close()")"
run_container "$root/cold-restore"
if wait_for_health; then echo 'unsupported database unexpectedly became healthy' >&2; exit 1; fi
test "$(docker inspect --format='{{.State.ExitCode}}' "$container")" != 0
docker logs "$container" >"$root/unsupported.log" 2>&1
grep --quiet 'unsupported migration version(s): 999' "$root/unsupported.log"
after="$(docker run --rm --mount "type=bind,source=$root/cold-restore,target=/config" "$image" node -e "const D=require('better-sqlite3');const d=new D('/config/stackmap.db',{readonly:true});process.stdout.write(JSON.stringify({hosts:d.prepare('SELECT * FROM hosts ORDER BY id').all(),revision:d.prepare(\"SELECT value FROM application_metadata WHERE key='inventory_revision'\").pluck().get(),migrations:d.prepare('SELECT version,name,checksum,applied_at FROM schema_migrations ORDER BY version').all()}));d.close()")"
test "$after" = "$before"

log "Validate unwritable /config fails with actionable diagnostics"
unwritable="$root/unwritable"
mkdir "$unwritable"
chmod 0555 "$unwritable"
run_container "$unwritable"
if wait_for_health; then echo 'unwritable config unexpectedly became healthy' >&2; exit 1; fi
test "$(docker inspect --format='{{.State.ExitCode}}' "$container")" != 0
docker logs "$container" >"$root/unwritable.log" 2>&1
grep -Eiq 'permission denied|EACCES|readonly|read-only' "$root/unwritable.log"
test ! -e "$unwritable/stackmap.db"

log "Deployment validation passed"

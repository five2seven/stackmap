# Architecture

## Application Type

StackMap is a local-first single-page web application.

## Frontend

Use:

- React
- TypeScript
- Vite

The interface should be responsive and work well on desktop and tablet-sized screens. Mobile support is secondary for the MVP.

## Data Storage

Use IndexedDB for local application data.

Do not use localStorage for the primary dataset because StackMap will store structured records and may grow beyond simple key-value data.

Use a small IndexedDB wrapper library if it improves reliability and maintainability. Prefer a lightweight, established option.

## Backend

The MVP will not have a hosted backend.

Do not add:

- Supabase
- Firebase
- Server-side APIs
- User accounts
- Cloud synchronization

## Data Portability

Support JSON export and import.

The exported file should include:

- A schema version
- Export timestamp
- All StackMap records required to restore the app

The current JSON export schema is version 3. The import boundary validates current path mappings, migrates valid version 1 services by adding empty identity fields and generalized paths, and migrates valid version 2 `configPath` and `dataPath` fields into generalized paths. Uploaded objects are not mutated.

The architecture should allow future migration if cloud synchronization is added later.

## Derived Views

The Port Map is a read-only projection built in memory from existing `Service`, `Host`, and service-port records. It groups and sorts assignments, applies search and host filtering, and derives assignment-level conflict relationships without writing a second dataset or changing the IndexedDB or JSON schemas. Editing routes back through the existing service form and repository.

The Path Map follows the same projection pattern over existing generalized `PathMapping` records. It groups by host and a conservative trimmed, case-insensitive host-path key, derives same-host cross-service sharing, and reuses the existing path-warning utility. Stored path values are never normalized or mutated, and editing uses the existing service form and repository. No database or backup-schema migration is required.

## Hosting

The proof-of-concept frontend will be hosted on Cloudflare Pages.

The intended public URL is:

`stackmap.rareobjectlabs.app`

The source repository is:

`five2seven/stackmap`

## Privacy

All user-created StackMap data remains in the user’s browser for the MVP.

The hosted application files are public, but the user’s homelab records are not uploaded to StackMap servers.

Browser data can be lost if the user clears site data or changes browsers without exporting a backup.

## Testing

Use:

- Vitest for unit and component tests
- Testing Library for UI behavior
- Build validation through `npm run build`

Use Playwright for focused browser workflows that cover IndexedDB persistence and critical user journeys.

## Architecture Constraints

- Keep the MVP local-first
- Do not add a backend without an explicit architecture decision
- Do not store credentials or secrets
- Keep data access separate from UI components
- Version the local data schema
- Preserve backward compatibility where practical
- Ensure import validation does not blindly trust uploaded JSON
- Keep deployment compatible with static hosting on Cloudflare Pages

Dexie database version 3 added service identity fields. Dexie database version 4 converts non-empty legacy `configPath` and `dataPath` values into path mappings and removes the legacy fields from current records without changing timestamps. IndexedDB versions describe on-device storage upgrades; JSON schema versions independently describe portable backup formats.

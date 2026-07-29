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
- Record optional hosts, URLs, paths, networks, exposure, dependencies, notes, and multiple ports
- Add and edit hosts, assign services to them, and protect referenced hosts from deletion
- Search services and filter by status, host, Docker network, and exposure
- Identify incomplete service records and duplicate host-port assignments
- Export the complete local dataset to a versioned JSON backup
- Validate and review JSON imports before replacing local data

Only a service name is required when creating a record. Incomplete records are intentionally supported.

## Local data and backups

All user-created data remains in the browser for this MVP. Clearing site data or switching browsers does not transfer the dataset. Use **Export JSON** to create a backup before clearing browser data or moving to another browser, and use **Import JSON** to validate and restore that backup.

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

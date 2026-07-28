# StackMap

A local-first homelab planning application

Repository: `stackmap`  
Default folder: `APP-StackMap`  
POC domain: `stackmap.rareobjectlabs.app`

## Prerequisites

- Node.js 22 or newer
- npm 10 or newer

## Getting started

```powershell
npm install
npm run dev
```

Vite prints the local development URL after startup.

## Available commands

- `npm run dev` starts the Vite development server.
- `npm run build` type-checks and creates a production build in `dist`.
- `npm run lint` checks the codebase with ESLint.
- `npm test` runs the Vitest test suite once.
- `npm run test:watch` runs Vitest in watch mode.

## Environment variables

Copy `.env.example` to `.env.local` if the application needs local configuration. `POC_DOMAIN` records deployment metadata and is not exposed to browser code. Browser-visible variables must use the `VITE_` prefix. Do not commit secrets.

## Standard deployment foundation

Proof-of-concept deployments follow this convention:

- Registrar: Porkbun
- DNS provider: Cloudflare
- POC hosting: Cloudflare Pages
- Source control: GitHub
- Umbrella domain: `rareobjectlabs.app`
- App POC domain: `stackmap.rareobjectlabs.app`
- Default POC domain: `stackmap.rareobjectlabs.app`

Examples include `stackmap.rareobjectlabs.app` and `parenting-time.rareobjectlabs.app`.

This template documents the convention only. Cloudflare configuration, DNS records, and deployment setup are performed separately.

## Project structure

```text
src/                  React application and tests
docs/                 Product, architecture, and decision records
index.html             Vite HTML entry point
vite.config.ts         Vite and Vitest configuration
eslint.config.js       ESLint flat configuration
```

## Customizing the template

Replace `StackMap`, `stackmap`, `APP-StackMap`, `A local-first homelab planning application`, and `stackmap.rareobjectlabs.app` when creating an application from this template. Unless explicitly overridden, set `stackmap.rareobjectlabs.app` to `stackmap.rareobjectlabs.app`. Then replace the neutral shell with product-specific components and documentation.

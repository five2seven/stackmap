# Release Checklist

## Release candidate scope

- [ ] Clean `main` fetched and synchronized with `origin/main`
- [ ] Entire enabled and available
- [ ] Current task, branch, scope, dependencies, and SQLite datastore authority confirmed
- [ ] Existing planned branch inspected before reuse
- [ ] No higher-authority conflict or unresolved decision blocks the task

## Documentation and commands

- [ ] README and linked operations guidance describe the self-hosted container as production
- [ ] Public demo is described as bundled, in-memory, session-only, and separate from production
- [ ] Deployment, backup/restore, upgrade, rollback, permissions, and recovery commands match repository automation
- [ ] Internal architecture, product, and decision records contain no active browser-authoritative or split-authority claims
- [ ] Public and repository-relative links resolve
- [ ] Release notes describe included behavior, upgrade guidance, limitations, and validation without claiming publication

## Validation before commit

- [ ] Full diff contains only task scope; no secrets, generated artifacts, or unapproved dependency/configuration changes
- [ ] `npm run lint`, `npm test`, and `npm run build`
- [ ] `npm run test:e2e` and `npm run test:e2e:demo`
- [ ] `npm run build:demo` artifact safeguards
- [ ] `npm audit --omit=dev`
- [ ] Linux/amd64 image build, container smoke test, and `scripts/validate-deployment.sh`
- [ ] `git diff --check`
- [ ] Documentation matches changed behavior and identifies the authoritative datastore

## Before merge

- [ ] Separate read-only review covers the full diff against `origin/main`
- [ ] Task-specific risks are reviewed in addition to generic checks
- [ ] Blocking, Important, Minor, and No issue findings reported
- [ ] Required validation rerun and recommendation is Ready to merge
- [ ] Feature branch has been pushed and the pull request targets `main`
- [ ] Exact-head GitHub Actions and Semgrep checks pass

## Publication boundary

Until those workflows are separately gated, every merge to `main` triggers both publication of the
`ghcr.io/five2seven/stackmap:latest` image and deployment of the Cloudflare Pages demo. Approval to merge
therefore also authorizes those two automatic actions; do not merge while either action is unintended.
Version tags, GitHub releases, and announcements remain separate actions requiring explicit approval.

- [ ] Merge approval explicitly accounts for automatic GHCR `latest` publication and Cloudflare Pages deployment
- [ ] Release review separately authorizes any version tag, GitHub release, or announcement
- [ ] Intended version and release notes are approved before tagging
- [ ] GHCR image visibility and documented tag are verified before directing users to deploy
- [ ] Cloudflare Pages demo deployment is healthy and still shows the session-only banner
- [ ] No release is described as published until its tag, image, and release record actually exist

## After merge

- [ ] `main` pushed and synchronized with `origin/main`; Entire checkpoint recorded
- [ ] GHCR, Portainer, and public-demo checks completed when relevant
- [ ] Completed task's datastore authority and limitations recorded
- [ ] No planning-file commit made directly on `main`
- [ ] If advancement is safe, a separate planning branch and pull request update the plan, current task, and checklist
- [ ] If validation failed or a decision remains unresolved, the next task stays Blocked and the reason is recorded

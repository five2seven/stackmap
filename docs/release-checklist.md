# Migration Release Checklist

## Before implementation

- [ ] Clean `main` fetched and synchronized with `origin/main`
- [ ] Entire enabled and available
- [ ] Current task, branch, scope, dependencies, and datastore authority confirmed
- [ ] Existing planned branch inspected before reuse
- [ ] No higher-authority conflict or unresolved decision blocks the task

## Before commit

- [ ] Full diff contains only task scope; no secrets, generated artifacts, or unapproved dependency/configuration changes
- [ ] `npm run lint`, `npm test`, and `npm run build`
- [ ] Relevant E2E tests
- [ ] Native dependency and Docker checks as soon as the task depends on them
- [ ] `git diff --check`
- [ ] Documentation matches changed behavior and identifies the authoritative datastore

## Before merge

- [ ] Separate read-only review covers the full diff against `origin/main`
- [ ] Task-specific risks are reviewed in addition to generic checks
- [ ] Blocking, Important, Minor, and No issue findings reported
- [ ] Required validation rerun and recommendation is Ready to merge
- [ ] Feature branch has been pushed and the pull request targets `main`

## After merge

- [ ] `main` pushed and synchronized with `origin/main`; Entire checkpoint recorded
- [ ] GHCR and Portainer checks completed when relevant
- [ ] Completed task's datastore authority and limitations recorded
- [ ] No planning-file commit made directly on `main`
- [ ] If advancement is safe, a separate planning branch and pull request update the plan, current task, and checklist
- [ ] If validation failed or a decision remains unresolved, the next task stays Blocked and the reason is recorded

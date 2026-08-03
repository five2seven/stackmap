# Migration Release Checklist

## Before implementation

- [ ] Working tree is clean on `main`
- [ ] Origin has been fetched and pruned
- [ ] `main` matches `origin/main`
- [ ] Entire is enabled and available
- [ ] `docs/current-task.md` identifies the correct task and branch

## Before commit

- [ ] Full scope reviewed; no unrelated changes
- [ ] No secrets, generated files, or unapproved dependency, lockfile, or configuration changes
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] Relevant end-to-end tests
- [ ] Relevant Docker checks when applicable
- [ ] `git diff --check`
- [ ] Documentation accurately reflects changed behavior

## Before merge

- [ ] Separate read-only review completed
- [ ] Full diff reviewed against `origin/main`
- [ ] Blocking, Important, Minor, and No issue findings reported
- [ ] Required validation rerun
- [ ] Recommendation is Ready to merge

## After merge

- [ ] `main` is pushed and synchronized with `origin/main`
- [ ] Entire checkpoint is recorded
- [ ] GHCR workflow checked when relevant
- [ ] Portainer smoke test completed when relevant
- [ ] Migration plan completion record updated
- [ ] Current task advanced
- [ ] Next dependency-unblocked task marked Ready

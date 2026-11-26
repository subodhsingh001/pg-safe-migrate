# PGSAFE 2.8.0 release candidate

Not published. The GitHub Action is distributed from the Git repository, not the npm tarball. Proposed action tag: `action-v1.0.0`; use an immutable reviewed commit SHA in consumer workflows.

## Local gates

Run `npm ci`, `npm test`, `npm run test:action-release`, `npm audit`, and `git diff --check`. Inspect the npm pack manifest and install the packed tarball in a clean directory; run both CLI aliases. Confirm the version is unused with `npm view pgsafe@2.8.0 version` (only a confirmed not-found response means it is unused).

## Live gates (manual evidence required)

- Release verification matrix and ORM migration verification workflow green on the release commit.
- In a disposable consumer repository, use the reviewed SHA in `examples/trusted-action-workflow.yml`. Verify safe SQL passes, destructive SQL blocks, missing/invalid report fails, and a fork PR cannot publish. Never checkout PR code under pull_request_target.
- In this repository, review and activate the separated example. Verify same-repository comment creation and update, stale head rejection, missing token/permission failure, fork skip, and blocked gate independent of publishing. Verify required checks attach to the intended PR head before enabling branch protection.
- Record run URLs and reviewed SHA. No stable tag or npm publication until all gates pass. No downtime guarantee.

## Publish only after approval

Use `npm publish --access public` from the reviewed release commit after checking npm ownership and authentication. Create immutable tags `v2.8.0` and `action-v1.0.0` on that commit; never move existing tags. Verify clean external installation and GitHub release notes. If a gate fails, stop and fix it before publishing.

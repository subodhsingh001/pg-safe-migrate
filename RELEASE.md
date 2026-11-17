# Release checklist: v1.1.2 candidate

1. `npm install` (generates `package-lock.json`); commit the lockfile.
2. `npm test`; all tests must pass.
3. `node bin/cli.js examples/unsafe.sql` must report PG001 and exit 1.
4. `node bin/cli.js examples/safe.sql` must exit 0.
5. `npm pack --dry-run`; review tarball contents.
6. Create public GitHub repository `subodhsingh001/pg-safe-migrate` if it does not exist. Verify the repo URL in package.json.
7. `git init` if needed; `git add .`; `git commit -m "Prepare pg-safe-migrate v1.1.2"`; `git branch -M main`; `git remote add origin https://github.com/subodhsingh001/pg-safe-migrate.git` (only if absent); `git push -u origin main`.
8. Confirm GitHub Actions workflow passes, including a test PR with an unsafe SQL file.
9. Only after verification: `npm publish --access public`. v1.1.1 is already published; do not try to republish it.
10. Verify from an unrelated folder with `npx --yes --package=@subodh001/pg-safe-migrate@1.1.2 pg-safe-migrate --help`.
11. Tag and push `v1.1.2`, then post launch copy from LAUNCH.md.

Note: this archive is a release candidate; the tests could not be executed in the preparation environment because npm dependency installation timed out. GitHub and npm publishing were not performed.

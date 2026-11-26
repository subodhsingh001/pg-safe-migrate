# Release checklist: v2.0.0

Version `2.0.0` is already published according to the maintainer. **Do not publish the same version again.**

## Release verification

1. Confirm `package.json` version is `2.0.0`.
2. Run `npm ci`, `npm test`, `node test/release-smoke.cjs`, and `npm pack --dry-run` from the project root.
3. Review the package file list from `npm pack --dry-run` (only intended CLI files should ship).
4. Confirm GitHub Actions is green on the latest commit.
5. Check `docs/internal/RELEASE-VERIFICATION.md` for tested PostgreSQL, Prisma, and Drizzle behavior and limitations.
6. Confirm external installation with `npx --yes pgsafe@2.7.1 --help`.
7. Commit documentation and test changes; push to the repository. Test-only/documentation changes do **not** require another npm publish.
8. If desired, create or verify a `v2.0.0` Git tag pointing at the actual published release commit; do not move an existing tag without deliberate release coordination.

## Future versions

For changes to the published npm package, increment the version, run all checks again, then publish the new version only after reviewing its release contents. See `docs/internal/UPGRADE-NOTES.md` for version-specific guidance.

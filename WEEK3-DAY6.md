# Week 3 Day 6 — documentation and adoption readiness

This additive patch provides three docs and a README navigation section. It changes **no CLI, rules, baselines, workflow, or extension runtime**.

Files:
- `docs/ADOPTION-GUIDE.md` — safe onboarding, Week 3 feature scope, CI, troubleshooting.
- `docs/DEMO-SCRIPT.md` — reproducible video walkthrough.
- `docs/MARKETPLACE-COPY.md` — proposed npm, GitHub, and VS Code copy; not auto-published.
- `README.md` — add a link section to the existing project README (do not replace your whole README).

## Local verification (PowerShell)

```powershell
npm run test:unit
npm run test:release
npm pack --dry-run
```

Manually check the README links and verify the Week 3 PR workflow on a real pull request. Do not publish until Day 7 release review.

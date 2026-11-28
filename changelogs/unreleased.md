# [Unreleased]

The service isn't deployed yet, so everything below is unreleased. Each entry
names the guard that protects it. Newest first.

### Added

- **Institutional memory**, modeled on the Math Magic app.
  - `BUG_REPORTS.md`: bug tracker with an open-bug index ranked by impact
    (P0 trust-breakers to P3 hygiene) and a filing template.
  - `SESSION_LEARNINGS_AND_REGRESSIONS.md`: general lessons, 15 taken from
    this project's own incidents.
  - `ENGINEERING_GUIDELINES.md`: canonical patterns, and known debt not to
    copy.
  - `.github/claude-review.md`: a pre-PR review with a learning loop.
  - `REGRESSION_TESTING_CHECKLIST.md`: manual-only checks.
  - This changelog.

  Bug and lesson IDs combine the date with a random suffix
  (`npm run bug:id`, `npm run lesson:id`), so parallel PRs never collide.
  Three open bugs are filed: BUG-20261128-a9a4, BUG-20261128-386c and
  BUG-20261128-d915. Guard: `tests/unit/memory-docs.test.ts`.

### Changed (merged 2026-11-27, PRs #5–#10)

Phases 0–4 and the end-to-end harness landed on `main`. Behavior changes made
in review:

- **`recommend()` status.** It returns `constraints_unmet`, with each unmet
  check in `errors`, when the final outfits fail a hard check. It no longer
  reports `ok`.
- **Outfit schema.** Template outfits are held to the outfit schema's length
  limits, and validation checks the schema (`outfit_schema`).
- **Occasions.** The consumer's literal values `active` and `home` are
  recognized.
- **Rubric.** It counts distinct accent colors.
- **Knowledge store.** It refuses to release over an unreadable
  `snapshot.json`, and rejects impossible calendar dates.
- **Harness.** The e2e command saves each scenario's collection beside the
  report.
- **Baseline latency.** Reported per model call and end to end.

Guards: the tests named in each fix's lesson in
`SESSION_LEARNINGS_AND_REGRESSIONS.md`.

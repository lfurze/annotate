# Contributing to Annotate

Thanks for your interest! Annotate is intentionally simple: **plain HTML/CSS/JS, no build step, no framework.** Please keep it that way — it's what makes the tool auditable and forkable.

## Ground rules

- **No build tooling or runtime package installation.** New third-party code, if truly needed, is vendored into `vendor/`, integrity-checked, and accompanied by its complete permissive licence and `NOTICE` attribution.
- **Privacy is the point.** Do not upload document content or annotations, add analytics/telemetry/tracking, or contact an external runtime service. Same-origin application and worker assets are explicitly allowlisted, and the app must remain usable offline once served locally.
- Match the existing style: the shared `AN` namespace, small focused functions, and the page/overlay model described in the README.

## Workflow

1. Fork and branch.
2. Make your change.
3. Run the test suite and make sure it stays green:
   ```bash
   python3 -m http.server 8777                 # in one terminal
   cd test && npm ci && npx playwright install chromium
   npm test                                    # in another terminal
   ```
4. If you add a feature, add a check (and ideally a screenshot assertion) to the suite.
5. Open a pull request describing what changed and why.

## Reporting bugs

Open an issue with the file type involved, the browser, and steps to reproduce. Never
attach a private document; create a small synthetic reproduction instead.

By contributing you agree your contributions are licensed under the Apache License 2.0.

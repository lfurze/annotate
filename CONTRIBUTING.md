# Contributing to Annotate

Thanks for your interest! Annotate is intentionally simple: **plain HTML/CSS/JS, no build step, no framework.** Please keep it that way — it's what makes the tool auditable and forkable.

## Ground rules

- **No build tooling and no runtime dependencies** in the app itself. New third-party code, if truly needed, is vendored into `vendor/` with its license recorded in `NOTICE`, and must be a permissive license (Apache-2.0, BSD, MIT, ISC).
- **Privacy is the point.** No code may make a network request, set a tracking cookie, or send data anywhere. The app must work fully offline.
- Match the existing style: the shared `AN` namespace, small focused functions, and the page/overlay model described in the README.

## Workflow

1. Fork and branch.
2. Make your change.
3. Run the test suite and make sure it stays green:
   ```bash
   python3 -m http.server 8777            # in one terminal
   cd test && node qa.js && node qa2.js   # in another
   ```
4. If you add a feature, add a check (and ideally a screenshot assertion) to the suite.
5. Open a pull request describing what changed and why.

## Reporting bugs

Open an issue with the file type involved, the browser, and steps to reproduce. A small sample document that triggers the problem is hugely helpful.

By contributing you agree your contributions are licensed under the Apache License 2.0.

# Release checklist

Annotate uses semantic versioning. Before 1.0, minor releases may change the editable
project format only when a documented, tested migration is included. Patch releases must
remain format-compatible. After 1.0, incompatible public behaviour or format changes
require a major release.

## Candidate checks

- [ ] Start from a clean clone; run `cd test && npm ci && npx playwright install chromium`.
- [ ] Serve the repository over HTTP and run `npm test` in `test/`.
- [ ] Run the compatibility suite with `BROWSER=firefox` and `BROWSER=webkit`.
- [ ] Manually test current Chrome, Edge, Firefox, and Safari with PDF, DOCX, and image samples.
- [ ] Complete keyboard-only, VoiceOver/screen-reader, 200% zoom, touch, and reduced-motion checks.
- [ ] Confirm imported documents cause no outbound requests and hostile-input tests pass.
- [ ] Verify save, editable reload, named projects, autosave recovery, print/PDF, and storage failure messaging.
- [ ] Review `PRIVACY.md`, `SECURITY.md`, `NOTICE`, bundled library versions, and licences.
- [ ] Use a dedicated origin for persistent projects. Default `*.github.io` project origins intentionally disable persistence.
- [ ] Prefer a host that applies `deploy/_headers`; inspect the live CSP and security headers. GitHub Pages ignores custom response-header files.
- [ ] Update `CHANGELOG.md`, choose the version, tag the exact tested commit, and retain test evidence.
- [ ] Smoke-test the public URL after deployment, including a private window and a mobile device.

The Pages workflow is prepared but cannot deploy until the public repository exists and
GitHub Pages is configured to use GitHub Actions.

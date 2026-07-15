# Annotate task list

This is the working backlog. Priorities are `P0` (release blocker), `P1` (important
for first public release), `P2` (valuable follow-up), and `P3` (exploratory).

## In progress

- [x] **P0** Validate saved-project structure and values before rendering.
- [x] **P0** Sanitise imported DOCX and saved-project HTML.
- [x] **P0** Add regression checks for scripts, event handlers, remote resources,
  unsafe URLs, malformed geometry, and oversized project data.
- [x] **P1** Establish CI-ready test commands and separate fast checks from browser QA.

## Trust and data safety

- [x] **P0** Add a dirty-state model and confirmation before open/load/navigation loss.
- [x] **P0** Surface IndexedDB transaction and quota failures.
- [x] **P0** Show saving, locally saved, and save-failed status accessibly.
- [x] **P1** Add explicit project schema versions and migration tests.
- [x] **P1** Add multiple named local projects and storage-management UI.
- [x] **P1** Document privacy boundaries and a vulnerability-reporting process.
- [x] **P1** Audit vendored library versions and licences before publication.
- [x] **P1** Integrity-check vendored libraries and bundle complete PDF resources and licence texts.

## Interaction and accessibility

- [x] **P1** Handle `pointercancel` and use pointer capture for every pointer operation.
- [x] **P1** Restore geometry when a resize or drag is cancelled.
- [x] **P1** Coalesce slider and colour changes into one undo operation.
- [x] **P1** Add accessible names, pressed states, focus styles, and live regions.
- [x] **P1** Complete automated keyboard annotation editing, reflow, contrast, dialog, and reduced-motion foundations.
- [ ] **P1** Complete the manual keyboard, screen-reader, zoom, contrast, and reduced-motion release checklist.
- [ ] **P2** Add vector resize/endpoint handles and outline-accurate hit testing.
- [ ] **P2** Clamp or deliberately expose annotation overflow behaviour.
- [ ] **P2** Add stylus pressure, coalesced pointer events, and path simplification.

## Documents, scale, and export

- [x] **P1** Wait for DOCX images/fonts before measuring the annotation surface.
- [x] **P1** Add progress and safe cancellation checkpoints for long imports.
- [x] **P1** Establish initial graceful file/page/pixel limits.
- [x] **P1** Add page thumbnails, page-number navigation, reorder, and guarded deletion.
- [x] **P1** Add local flattened output through the browser's Print / Save as PDF flow.
- [x] **P2** Add flattened PNG export for the current page.
- [x] **P2** Store raster assets as blobs in autosave and named-project persistence while retaining portable HTML export.
- [x] **P2** Virtualise raster background decoding while materialising all pages for print/export.
- [x] **P2** Add persistent searchable/selectable PDF text layers.
- [x] **P2** Add page reorder, guarded deletion, and safe pre-annotation raster rotation.
- [x] **P2** Add an annotation/comment sidebar with page navigation and selection.
- [ ] **P3** Evaluate standards-based annotation interchange.
- [ ] **P3** Explore genuine destructive redaction with explicit safety warnings.

## Public release

- [x] **P0** Ensure a clean distribution copy can install locked test dependencies and pass all documented checks.
- [x] **P1** Add GitHub Actions for syntax, privacy, security, browser QA, and foundational accessibility checks.
- [x] **P1** Add issue/PR templates, code of conduct, security policy, and support guidance.
- [ ] **P1** Deploy to Cloudflare Pages at `annotate.readcloser.com` and verify the prepared host-level security headers.
- [x] **P1** Add a release checklist and semantic versioning policy.
- [ ] **P1** Complete manual Chrome, Edge, Firefox, and Safari release checks; automated Chromium, Firefox, and WebKit coverage is prepared.
- [ ] **P2** Add a public roadmap and contribution-friendly issue labels.

## Completed

- [x] Establish product principles, release phases, and a public-release definition.
- [x] Keep production runtime local, static, and free of third-party network services.

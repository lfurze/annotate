# Annotate project plan

## Product intent

Annotate is a free, privacy-first document annotation tool that runs entirely in
the browser. It should be useful as a standalone public tool and remain capable
of fitting into a broader Read Closer publishing or education ecosystem.

The application should stay easy to audit and self-host: plain HTML, CSS, and
JavaScript; no account; no telemetry; no document upload; no runtime dependency
on third-party services.

## Product principles

1. **Private by construction.** Imported documents and annotations do not leave
   the device. Any feature that would require a network request must be excluded
   from the default application or require a separate, explicit product decision.
2. **Safe local files.** A local file is untrusted input. PDF, DOCX, images, and
   saved projects must not be able to execute code or trigger hidden requests.
3. **Portable ownership.** Users can save work in an open, inspectable format and
   view the result without Annotate or an account.
4. **Honest resilience.** The interface must report whether work is saved. Storage
   failures, unsupported files, and document limits must be visible and recoverable.
5. **Accessible reading.** Keyboard, touch, stylus, screen-reader, zoom, contrast,
   and reduced-motion use are product requirements rather than final polish.
6. **Small, comprehensible architecture.** Prefer browser standards and focused
   modules. Vendored code needs a compelling reason and a recorded licence.

## Release phases

### Phase 1 — Trust and data safety

- Validate and sanitise all loaded project and DOCX content.
- Add hostile-input regression tests and a documented security policy.
- Track dirty state and confirm destructive document replacement.
- Report autosave success and failure accurately.
- Add project-format versioning and migration boundaries.

### Phase 2 — Interaction quality and accessibility

- Make pointer operations cancellation-safe and use pointer capture.
- Coalesce continuous controls into single undo operations.
- Complete keyboard navigation, accessible names, focus treatment, live status,
  contrast review, and reduced-motion support.
- Add automated accessibility checks plus manual keyboard/screen-reader checks.

### Phase 3 — Document scale and fidelity

- Wait for DOCX assets before measuring and respond safely to layout changes.
- Move raster storage away from base64 where practical.
- Add lazy PDF page rendering and DOM virtualisation.
- Preserve or provide a searchable PDF text layer.
- Establish tested document-size limits and graceful cancellation.

### Phase 4 — Core product expansion

- Add page thumbnails, navigation, rotation, reorder, and deletion.
- Add an annotation list with filtering and comment navigation.
- Add flattened PDF and image export while retaining editable HTML projects.
- Add multiple named local projects and storage management.

### Phase 5 — Public release

- Add CI across supported browsers, vendored dependency/licence integrity checks, and a release build audit.
- Publish contributor, security-reporting, privacy, compatibility, and project-format docs.
- Create the public GitHub repository and configure a static host with security headers.
- Run a launch accessibility, privacy, performance, and browser-compatibility review.

## Architecture decisions

- The editable project snapshot remains separate from the standalone rendered view.
- Imported HTML is sanitised at the trust boundary and validated again when a saved
  project is loaded.
- No service worker is required for the first public release; vendored assets already
  permit offline use, and cache behaviour should not complicate privacy claims early.
- Framework adoption is not planned. Revisit only if concrete complexity or testing
  evidence outweighs the auditability and `file://` benefits of the current design.

## Optional Read Closer fit

Annotate remains a general-purpose tool. A future Read Closer companion mode may add
optional reading-session templates, SLOW-method prompts, reading logs, source/claim
flags, and annotation-to-argument views. These should help readers form and preserve
their own judgement. Automated interpretation or summarisation is not a default
direction, and any later AI feature would require a separate privacy and product review.

## Definition of public-release ready

- No known high-severity active-content or data-loss issue.
- Security, save/load, restore, import, export, keyboard, touch, and accessibility
  regression tests pass in the supported browser matrix.
- Storage failure and large-document behaviour are understandable to users.
- Public documentation accurately describes privacy boundaries and browser support.
- Third-party versions, licences, and update process are documented.
- A fresh clone can be served and tested using documented commands.

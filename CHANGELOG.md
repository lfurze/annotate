# Changelog

This project follows semantic versioning. Notable changes are recorded here.

## Unreleased

- Hardened project and DOCX validation against active content and oversized input.
- Added reliable autosave, named local projects, storage management, and blob-backed raster persistence.
- Added page organisation, annotation review, searchable PDF text, print/PDF output, and cancellable imports.
- Added native flattened PNG export for the current PDF or image page.
- Improved keyboard, touch, reduced-motion, status, and cross-browser accessibility behaviour.
- Added automated security, privacy, interaction, storage, import, and compatibility coverage.
- Bundled integrity-checked PDF CMaps, fonts, decoders, and complete third-party licence texts.
- Isolated DOCX conversion in a time-bounded worker and allowlisted every runtime asset request.
- Added keyboard editing/movement for textual annotations and responsive actions without control-bar horizontal scrolling.
- Disabled persistent document storage on shared `*.github.io` origins and added dedicated-host security headers.

The first public candidate will be tagged `0.1.0` after the manual release checks and
hosted smoke test are complete.

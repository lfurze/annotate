# Privacy

Annotate processes documents and annotations locally in your browser. The app has
no account system, analytics, advertising, telemetry, tracking cookies, or document
upload API.

## What stays on your device

- The contents of imported PDF, DOCX, and image files.
- Annotation text, drawings, comments, and document backgrounds.
- The current recovery copy stored in the browser's IndexedDB database.
- Editable project exports downloaded as self-contained HTML files.

Annotate does not intentionally transmit any of this information.

## Network boundaries

When the hosted app is opened, its HTML, CSS, JavaScript, worker, font, and image
assets are downloaded from the host like any other website. The host may therefore
receive standard request metadata such as IP address, time, browser user agent, and
requested asset paths. This is separate from document processing: imported documents
are not sent with those requests.

Converted document content cannot load remote images or active content. A safe web
link present in a DOCX may remain clickable, but Annotate does not open it
automatically. Following that link is an intentional navigation to another website
and is governed by that site's privacy practices.

## Local recovery storage

Annotate keeps one automatic recovery copy in IndexedDB after a document is edited.
Users can also create explicitly named local project copies. The Projects dialog shows
their approximate size and can delete them; the restore banner can discard the automatic
copy. Browser site-data controls can remove all copies. Clearing browser data, using
private browsing, storage pressure, or browser policy may remove or prevent recovery
storage, so users should export important work.

Browser databases are shared by every page on the same web origin, regardless of URL
path. Annotate therefore disables autosave and named-project persistence on default
`*.github.io` project-site origins, where unrelated repositories share an origin. Editable
HTML export remains available. A deployment with a dedicated custom origin can safely
enable the local project features.

## Saved projects

A saved `.annotated.html` file contains the rendered document, all annotations, and
an editable project snapshot. Anyone who receives the file can read that content.
Treat it with the same care as the source document.

## Privacy regression policy

Automated tests reject executable imported markup and exercise PDF, DOCX, and image
imports against an explicit allowlist of locally served application resources. Changes that introduce network communication or a new
data processor require an explicit product decision and documentation update; they
must never be added silently.

File-size, page-count, and pixel limits reduce accidental exhaustion and common local
denial-of-service inputs. PDF parsing and DOCX conversion run in workers where practical;
no browser tool can guarantee that every malicious compressed or decoder input will avoid
a tab or worker crash, so untrusted files should still be treated cautiously.

# Annotate

**Privacy-first, fully-local document annotation in your browser.**
Open PDFs, Word documents and images; draw, highlight, add text, sticky notes and comments; then save everything as a single self-contained HTML file. Nothing is ever uploaded — there is no server, no account, no analytics, no network calls of any kind.

![The Annotate editor](docs/screenshot-editor.png)

---

## Why

Most "online" annotation tools quietly send your documents to someone else's server. Annotate doesn't. The entire application is static HTML, CSS and JavaScript that runs in your browser. Your files are read locally, rendered locally, annotated locally and saved locally. You can verify this yourself — open your browser's network tab and watch it stay empty.

It's a single folder of plain files with **no build step**, which makes it trivial to audit, fork, self-host, or just double-click to open.

## Features

- **Open** PDF, DOCX, and images (PNG, JPG, GIF, WebP, BMP, SVG)
- **Draw tools** — freehand pen, rectangle, ellipse, arrow, straight line (hold <kbd>Shift</kbd> to constrain)
- **Highlighter** with 6 colours and adjustable thickness (true multiply blend over text)
- **Text boxes** with font family, size, colour, bold and italic
- **Sticky notes** — resizable, in any colour
- **Comments** — pin-and-bubble threads anchored to the page
- **Colour controls** — 6 quick swatches plus a full custom colour picker
- **Select / move / resize / delete** any annotation
- **Undo / redo** with full history
- **Zoom** in and out
- **Save** as a **self-contained `.html`** file — viewable in *any* browser, *and* re-editable in Annotate
- **Autosave** to local browser storage — reopen the tab and pick up where you left off
- **Drag & drop** files anywhere onto the window
- **Keyboard shortcuts** for every tool (press <kbd>?</kbd> in-app)
- **Touch & mobile friendly** — auto-detected, with a bottom tool bar and natural gestures (see below)

![Annotating a Word document](docs/screenshot-docx.png)

## Touch & mobile

Annotate detects touch devices automatically and switches to a thumb-friendly layout (a scrollable tool bar along the bottom, larger targets, compact top bar). Gestures follow the convention drawing apps use:

| Gesture | Does |
|---|---|
| **One finger** | Uses the current tool — draw, highlight, drag an annotation… |
| **Two fingers** | Pan **and** pinch-zoom, from any tool. Starting a two-finger gesture cancels an accidental stroke the first finger began. |
| **One finger in Select mode** | Scrolls/pans the page |

<img src="docs/screenshot-mobile.png" alt="Annotate on a phone" width="320">

On desktop, the same empty-canvas drag works as a quick grab-to-pan, and the mouse wheel scrolls as usual.

## Try it

### Hosted / self-hosted (recommended)

Serve the folder with any static web server and open it:

```bash
# Python (built in on macOS/Linux)
python3 -m http.server 8777
# then open http://127.0.0.1:8777
```

Or drop the folder on GitHub Pages, Netlify, Cloudflare Pages, an S3 bucket — anywhere that serves static files. There is nothing to build.

### Just open the file

In Chromium-based browsers you can usually just **double-click `index.html`** and everything (including PDF and DOCX) works straight off `file://`. Some browsers restrict web workers on `file://`, so if PDFs fail to render, use the static-server method above.

## How the save format works

When you click **Save**, Annotate writes one `.html` file that contains two things:

1. A fully-rendered, static copy of your document and annotations — so anyone can open the file in any browser and *see* your work, with no dependencies.
2. An embedded JSON snapshot of the project (inside a `<script type="application/json">` tag) — so when you open that same file with **Load project**, Annotate rehydrates it into a fully editable session.

One file, portable, viewable, and re-editable. No sidecar files, no lock-in.

> DOCX is rendered to clean, styled HTML (via [mammoth](https://github.com/mwilliamson/mammoth.js)) and annotated on an overlay. PDFs and images are rasterised per page (via [pdf.js](https://github.com/mozilla/pdf.js)) and annotated on an overlay. This keeps annotation behaviour consistent across every file type.

## Keyboard shortcuts

| Key | Action | Key | Action |
|---|---|---|---|
| <kbd>V</kbd> | Select / move | <kbd>T</kbd> | Text box |
| <kbd>P</kbd> | Pen | <kbd>N</kbd> | Sticky note |
| <kbd>H</kbd> | Highlighter | <kbd>C</kbd> | Comment |
| <kbd>R</kbd> | Rectangle | <kbd>Ctrl/⌘ S</kbd> | Save HTML |
| <kbd>E</kbd> | Ellipse | <kbd>O</kbd> / <kbd>L</kbd> | Open / Load |
| <kbd>A</kbd> | Arrow | <kbd>Ctrl/⌘ Z</kbd> | Undo (add <kbd>⇧</kbd> for redo) |
| <kbd>⇧ L</kbd> | Line | <kbd>Del</kbd> | Delete selected |
| <kbd>+</kbd> / <kbd>−</kbd> / <kbd>0</kbd> | Zoom in / out / reset | <kbd>Esc</kbd> | Deselect / Select tool |

## Project structure

```
index.html          App shell & markup
css/styles.css      All styling (no framework)
js/state.js         State, undo/redo history, IndexedDB autosave
js/import.js        File import — PDF / DOCX / image → pages
js/editor.js        Page rendering, all tools, selection, move/resize
js/io.js            Save / load self-contained HTML
js/app.js           Toolbar, property bar, keyboard, touch detection, init
js/gestures.js      Two-finger pan + pinch-zoom for touch devices
vendor/             pdf.js (Apache-2.0) + mammoth (BSD-2) — vendored, offline
samples/            Example PDF / DOCX / PNG for testing
test/               Playwright QA suite + sample generator
```

### Architecture notes

- **No framework, no build.** Plain `<script>` files share a single `AN` namespace. This is deliberate: it keeps the tool auditable and forkable, and it works from `file://`.
- **Pages + overlays.** Every document becomes a list of *pages*. Each page has a background layer (a rasterised image for PDF/images, or styled HTML for DOCX) and transparent overlays: an SVG layer for vector annotations (pen, shapes, highlighter) and an HTML layer for text, notes and comments. Annotation coordinates are stored in page-natural units, so zoom is a pure CSS transform and never mutates data.
- **History** snapshots only the annotation array (backgrounds are immutable after import), keeping undo/redo fast and memory-light.
- **Autosave** writes to IndexedDB, which comfortably handles rasterised PDFs that would blow past `localStorage`'s limits. It degrades to a no-op in private-mode browsers rather than erroring.

## Development & testing

The app has no dependencies. The **test suite** uses [Playwright](https://playwright.dev) to drive a real headless browser through every feature and verify it with screenshots.

```bash
# 1. serve the app
python3 -m http.server 8777

# 2. install test deps once
cd test && npm install && npx playwright install chromium

# 3. (re)generate sample documents
python3 make_samples.py

# 4. run the suites
node qa.js     # import, all tools, save/load roundtrip, PDF, DOCX
node qa2.js    # docx roundtrip, live restyle, resize, zoom
node qa3.js    # touch: mobile layout, one-finger draw/pan, pinch-zoom
```

Screenshots land in `test/screenshots/`.

## Browser support

Works in current Chrome, Edge, Firefox and Safari. PDF rendering uses web workers, which are available on all of them over `http(s)`.

## Privacy

- No network requests. No telemetry. No cookies. No third-party calls.
- Documents are processed entirely in your browser.
- Autosaved work lives only in your browser's local storage on your machine, and can be discarded at any time.

## License

[Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for third-party attributions.

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

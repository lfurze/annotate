/* Annotate security regression checks. Apache-2.0 */
const { browserName, browserType } = require("./browser");

const BASE = process.env.ANNOTATE_URL || "http://127.0.0.1:8777";
let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log("  ✅ " + name); }
  else { fail++; console.log("  ❌ " + name + (detail ? " — " + detail : "")); }
}

(async () => {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const outbound = [];
  page.on("request", req => {
    try { if (new URL(req.url()).origin !== new URL(BASE).origin) outbound.push(req.url()); }
    catch (_) { outbound.push(req.url()); }
  });
  await page.goto(BASE);

  console.log("\n# Untrusted saved project");
  const result = await page.evaluate(() => {
    const project = {
      v: 1, savedAt: new Date().toISOString(), title: "Hostile project", nextId: 2,
      pages: [{
        id: "p1", kind: "html", w: 800, h: 600, bg: null,
        html: '<div class="docx"><p>Safe text</p>' +
          '<script>window.__annotatePwned=1<\/script>' +
          '<img src="https://example.invalid/beacon.png" onerror="window.__annotatePwned=2">' +
          '<svg onload="window.__annotatePwned=3"></svg>' +
          '<a id="bad" href="javascript:window.__annotatePwned=4" style="background:url(https://example.invalid/style)">bad</a>' +
          '<iframe src="https://example.invalid/frame"></iframe></div>',
      }],
      anns: [{ id: "a1", page: "p1", type: "comment", x: 40, y: 40, text: "Still safe", color: '\"/><image href="https://example.invalid/pin">', open: true }],
    };
    const json = JSON.stringify(project).replace(/</g, "\\u003c");
    const loaded = AN.io.loadFromText('<!doctype html><script type="application/json" id="annotate-state">' + json + '<\/script>');
    const rendered = document.querySelector(".bg-html");
    const link = rendered && rendered.querySelector("a");
    const exported = AN.io.buildHtml();
    return {
      loaded,
      pwned: window.__annotatePwned,
      text: rendered && rendered.textContent,
      activeNodes: rendered ? rendered.querySelectorAll("script,img,svg,iframe,object,embed,form").length : -1,
      unsafeAttrs: rendered ? rendered.querySelectorAll("[style],[onerror],[onload]").length : -1,
      href: link && link.getAttribute("href"),
      commentColor: AN.state.anns[0] && AN.state.anns[0].color,
      exportHasActiveMarkup: /onerror=|example\.invalid|<iframe|<script(?! type="application\/json")/i.test(exported),
      exportHasCsp: exported.includes("Content-Security-Policy"),
    };
  });
  check("valid project loads", result.loaded);
  check("safe document text remains", result.text && result.text.includes("Safe text"));
  check("active elements are removed", result.activeNodes === 0, String(result.activeNodes));
  check("event handlers and inline styles are removed", result.unsafeAttrs === 0, String(result.unsafeAttrs));
  check("unsafe link protocol is removed", result.href === null, String(result.href));
  check("project markup did not execute", result.pwned === undefined, String(result.pwned));
  check("hostile annotation colour is canonicalised", result.commentColor === "#e23b3b", result.commentColor);
  check("standalone export contains no hostile active markup", !result.exportHasActiveMarkup);
  check("standalone export includes a restrictive CSP", result.exportHasCsp);
  await page.waitForTimeout(200);
  check("project caused no outbound request", outbound.length === 0, outbound.join(", "));

  console.log("\n# Invalid schema is atomic");
  const invalid = await page.evaluate(() => {
    const before = JSON.stringify({ title: AN.state.title, nextId: AN.state.nextId, pages: AN.state.pages, anns: AN.state.anns });
    const bad = {
      v: 1, title: "Bad", nextId: 1,
      pages: [
        { id: "same", kind: "html", w: 100, h: 100, bg: null, html: "<p>one</p>" },
        { id: "same", kind: "html", w: 100, h: 100, bg: null, html: "<p>two</p>" },
      ],
      anns: [],
    };
    const loaded = AN.loadSerialized(bad);
    const after = JSON.stringify({ title: AN.state.title, nextId: AN.state.nextId, pages: AN.state.pages, anns: AN.state.anns });
    return { loaded, unchanged: before === after, error: AN.lastLoadError && AN.lastLoadError.message };
  });
  check("duplicate IDs are rejected", invalid.loaded === false);
  check("rejected load leaves current project unchanged", invalid.unchanged);
  check("rejected load exposes a useful error", /duplicate/i.test(invalid.error || ""), invalid.error);

  console.log("\n# Dirty state and local autosave");
  const persistence = await page.evaluate(async () => {
    const initiallyClean = !AN.isDirty();
    AN.addAnn({ page: "p1", type: "text", x: 10, y: 10, text: "Changed", color: "#e23b3b",
      fontFamily: AN.settings.fontFamily, fontSize: 16, bold: false, italic: false });
    const dirtyAfterChange = AN.isDirty();
    const originalConfirm = window.confirm;
    window.confirm = () => false;
    const discardCancelled = AN.confirmDiscard() === false;
    window.confirm = originalConfirm;
    AN.state.pages.push({ id: "blob-page", kind: "image", w: 1, h: 1,
      bg: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      html: null, pdfText: [], thumb: null });
    let finalStatus = null;
    AN.on("autosave", info => { finalStatus = info.status; });
    const saved = await AN.autosaveNow();
    return { initiallyClean, dirtyAfterChange, discardCancelled, saved, finalStatus };
  });
  check("loaded project begins clean", persistence.initiallyClean);
  check("annotation change marks project dirty", persistence.dirtyAfterChange);
  check("destructive replacement can be cancelled", persistence.discardCancelled);
  check("autosave waits for a successful transaction", persistence.saved === true);
  check("successful local save status is emitted", persistence.finalStatus === "saved", persistence.finalStatus);
  const storedRaster = await page.evaluate(() => new Promise(resolve => {
    const req = indexedDB.open("annotate-db", 3);
    req.onsuccess = () => {
      const get = req.result.transaction("sessions", "readonly").objectStore("sessions").get("current");
      get.onsuccess = () => { const pg = get.result.pages.find(p => p.kind === "image"); resolve({ blob: pg.bgBlob instanceof Blob, bg: pg.bg, size: pg.bgBlob && pg.bgBlob.size }); };
      get.onerror = () => resolve({ blob: false });
    };
    req.onerror = () => resolve({ blob: false });
  }));
  const supportedPersistence = storedRaster.blob ? storedRaster.bg === null && storedRaster.size > 0 : browserName === "webkit" && /^data:image\//.test(storedRaster.bg || "");
  check("autosave uses blob persistence or the WebKit compatibility fallback", supportedPersistence, JSON.stringify(storedRaster));
  const hydratedRaster = await page.evaluate(async () => {
    const restored = await AN.readAutosave(), page = restored.pages.find(p => p.kind === "image");
    return { dataUrl: /^data:image\//.test(page.bg || ""), noBlobField: !("bgBlob" in page) };
  });
  check("autosave hydration restores portable validated raster data", hydratedRaster.dataUrl && hydratedRaster.noBlobField, JSON.stringify(hydratedRaster));

  console.log("\n# Import resource limits");
  const limits = await page.evaluate(async () => {
    const fake = { name: "oversized.pdf", type: "application/pdf", size: 101 * 1024 * 1024 };
    try { await AN.importFile(fake); return { rejected: false, message: "" }; }
    catch (e) { return { rejected: true, message: e.message }; }
  });
  check("oversized input is rejected before parsing", limits.rejected);
  check("resource-limit error is understandable", /maximum 75 MB/i.test(limits.message), limits.message);

  console.log("\n# Hosted storage isolation");
  const hostPolicy = await page.evaluate(() => ({ github: AN.persistenceAllowedForHost("lfurze.github.io"), dedicated: AN.persistenceAllowedForHost("annotate.example.org") }));
  check("shared GitHub Pages origins disable persistent document storage", !hostPolicy.github && hostPolicy.dedicated, JSON.stringify(hostPolicy));

  await browser.close();
  console.log("\n==== " + pass + " passed, " + fail + " failed ====");
  process.exit(fail ? 1 : 0);
})().catch(err => { console.error("HARNESS ERROR:", err); process.exit(1); });

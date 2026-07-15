/* Annotate multi-page navigation and flattened-output checks. Apache-2.0 */
const { browserType } = require("./browser");
const path = require("path");

const BASE = process.env.ANNOTATE_URL || "http://127.0.0.1:8777";
const PDF = path.join(__dirname, "..", "samples", "sample.pdf");
let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log("  ✅ " + name); }
  else { fail++; console.log("  ❌ " + name + (detail ? " — " + detail : "")); }
}

(async () => {
  const browser = await browserType.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 750 } });
  page.on("dialog", d => d.accept());
  await page.goto(BASE);
  await page.setInputFiles("#file-open", PDF);
  await page.waitForSelector("#pages .page-slot:nth-child(2)");
  await page.waitForFunction(() => !document.getElementById("page-nav").hidden);

  console.log("\n# Multi-page navigation");
  const initial = await page.evaluate(() => ({
    label: document.getElementById("page-label").textContent,
    prevDisabled: document.getElementById("btn-page-prev").disabled,
    nextDisabled: document.getElementById("btn-page-next").disabled,
  }));
  check("page count is announced", initial.label === "1 / 2", initial.label);
  check("navigation bounds are reflected", initial.prevDisabled && !initial.nextDisabled);
  await page.click("#btn-page-next");
  await page.waitForFunction(() => document.getElementById("page-label").textContent === "2 / 2");
  const next = await page.evaluate(() => ({
    label: document.getElementById("page-label").textContent,
    nextDisabled: document.getElementById("btn-page-next").disabled,
  }));
  check("next control advances the current page", next.label === "2 / 2");
  check("next control disables at the final page", next.nextDisabled);

  console.log("\n# Flattened print/PDF path");
  const printed = await page.evaluate(async () => {
    window.__printCalled = false;
    const original = window.print;
    window.print = () => { window.__printCalled = true; };
    document.querySelectorAll("#pages img.bg").forEach(img => img.removeAttribute("src"));
    const result = await AN.io.print();
    const ready = Array.from(document.querySelectorAll("#pages img.bg")).every(img => img.complete && img.naturalWidth > 0);
    window.print = original;
    return { result, called: window.__printCalled, ready, selected: AN.editor.selectedId() };
  });
  check("print action invokes the local browser print engine", printed.result && printed.called);
  check("every lazy raster page is decoded before print starts", printed.ready);
  check("editor selection chrome is cleared before printing", printed.selected === null);
  const printCss = await page.evaluate(() => Array.from(document.styleSheets).some(sheet => {
    try { return Array.from(sheet.cssRules).some(rule => rule.media && rule.media.mediaText === "print"); }
    catch (_) { return false; }
  }));
  check("print-specific editor-free layout is present", printCss);

  console.log("\n# Flattened PNG path");
  await page.evaluate(() => {
    const pg = AN.state.pages[1];
    AN.addAnn({ page: pg.id, type: "rect", x: 30, y: 30, x2: 180, y2: 120, color: "#e23b3b", width: 6 });
    AN.editor.renderAll();
  });
  const png = await page.evaluate(async () => {
    const blob = await AN.io.renderPagePng(1), bytes = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
    return { type: blob.type, size: blob.size, signature: Array.from(bytes).join(",") };
  });
  check("current page rasterises to a non-empty PNG", png.type === "image/png" && png.size > 1000 && png.signature === "137,80,78,71,13,10,26,10", JSON.stringify(png));
  await page.evaluate(() => AN.goToPage(1));
  await page.waitForFunction(() => document.getElementById("page-label").textContent === "2 / 2");
  const downloadPromise = page.waitForEvent("download");
  await page.click("#btn-png");
  const download = await downloadPromise;
  check("PNG action uses the current page number in its filename", /-page-2\.png$/.test(download.suggestedFilename()), download.suggestedFilename());

  await browser.close();
  console.log("\n==== " + pass + " passed, " + fail + " failed ====");
  process.exit(fail ? 1 : 0);
})().catch(err => { console.error("HARNESS ERROR:", err); process.exit(1); });

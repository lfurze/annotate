/* Annotate page thumbnail, reorder, and deletion checks. Apache-2.0 */
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
  const page = await browser.newPage({ viewport: { width: 1250, height: 800 } });
  page.on("dialog", dialog => dialog.accept());
  await page.goto(BASE);
  await page.setInputFiles("#file-open", PDF);
  await page.waitForSelector("#pages .page-slot:nth-child(2)");
  const initial = await page.evaluate(() => ({ ids: AN.state.pages.map(p => p.id), bgLength: AN.state.pages[0].bg.length,
    thumbLength: AN.state.pages[0].thumb.length, w: AN.state.pages[0].w, h: AN.state.pages[0].h,
    textAngle: AN.state.pages[0].pdfText[0].angle }));

  console.log("\n# Page thumbnails");
  await page.click("#btn-pages");
  const thumbs = await page.evaluate(() => ({
    count: document.querySelectorAll(".page-thumb-row").length,
    images: document.querySelectorAll(".page-thumb-main img").length,
    expanded: document.getElementById("btn-pages").getAttribute("aria-expanded"),
  }));
  check("page sidebar exposes every page", thumbs.count === 2 && thumbs.expanded === "true");
  check("raster pages use generated thumbnails", thumbs.images === 2);
  check("thumbnail payload is smaller than page background", initial.thumbLength < initial.bgLength, initial.thumbLength + " vs " + initial.bgLength);

  console.log("\n# Safe pre-annotation rotation");
  await page.click('[aria-label="Rotate page 1 right"]');
  await page.waitForFunction(w => AN.state.pages[0].w !== w, initial.w);
  const rotated = await page.evaluate(() => ({
    w: AN.state.pages[0].w, h: AN.state.pages[0].h, angle: AN.state.pages[0].pdfText[0].angle,
    dirty: AN.isDirty(), thumbnail: AN.state.pages[0].thumb,
  }));
  check("clockwise rotation swaps page dimensions", rotated.w === initial.h && rotated.h === initial.w, rotated.w + "×" + rotated.h);
  check("rotation preserves and transforms selectable PDF text", Math.abs(rotated.angle - initial.textAngle) === 90);
  check("rotation refreshes thumbnail and dirty state", rotated.thumbnail && rotated.dirty);
  const annotation = await page.evaluate(id => {
    const ann = AN.addAnn({ page: id, type: "comment", x: 100, y: 120, text: "Page-linked note", color: "#e23b3b", open: false });
    AN.editor.renderAll(); return ann.id;
  }, initial.ids[0]);
  await page.waitForFunction(id => document.querySelector('.page-thumb-row[data-id="' + id + '"] [aria-label^="Rotate page"]').disabled, initial.ids[0]);
  check("rotation controls lock once annotations exist", await page.isDisabled('.page-thumb-row[data-id="' + initial.ids[0] + '"] [aria-label="Rotate page 1 right"]'));

  console.log("\n# Reorder without breaking annotations");
  await page.click('[aria-label="Move page 2 up"]');
  const reordered = await page.evaluate(id => ({
    order: AN.state.pages.map(p => p.id), annotationPage: AN.getAnn(id).page,
    firstRow: document.querySelector(".page-thumb-row").dataset.id,
    dirty: AN.isDirty(),
  }), annotation);
  check("page order changes in state and sidebar", reordered.order[0] === initial.ids[1] && reordered.firstRow === initial.ids[1]);
  check("page-linked annotation remains attached to its page", reordered.annotationPage === initial.ids[0]);
  check("page reordering marks project dirty", reordered.dirty);

  console.log("\n# Guarded page deletion");
  await page.click('.page-thumb-row[data-id="' + initial.ids[0] + '"] [aria-label^="Delete page"]');
  await page.waitForFunction(() => AN.state.pages.length === 1);
  await page.waitForFunction(() => document.querySelectorAll(".page-thumb-row").length === 1 && document.getElementById("page-nav").hidden);
  const deleted = await page.evaluate(() => ({
    pages: AN.state.pages.length, annotations: AN.state.anns.length,
    rows: document.querySelectorAll(".page-thumb-row").length,
    navHidden: document.getElementById("page-nav").hidden,
    deleteDisabled: document.querySelector(".page-mini[aria-label^='Delete page']").disabled,
  }));
  check("deletion removes page and its annotations", deleted.pages === 1 && deleted.annotations === 0);
  check("page UI and navigation update after deletion", deleted.rows === 1 && deleted.navHidden && deleted.deleteDisabled);

  await browser.close();
  console.log("\n==== " + pass + " passed, " + fail + " failed ====");
  process.exit(fail ? 1 : 0);
})().catch(err => { console.error("HARNESS ERROR:", err); process.exit(1); });

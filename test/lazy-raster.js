/* Annotate raster virtualisation and export materialisation checks. Apache-2.0 */
const { browserName, browserType } = require("./browser");
const path = require("path");

const BASE = process.env.ANNOTATE_URL || "http://127.0.0.1:8777";
const IMAGE = path.join(__dirname, "..", "samples", "sample-image.png");
let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log("  ✅ " + name); }
  else { fail++; console.log("  ❌ " + name + (detail ? " — " + detail : "")); }
}

(async () => {
  const browser = await browserType.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  await page.goto(BASE);
  await page.setInputFiles("#file-open", IMAGE);
  await page.waitForSelector(".page img.bg");

  console.log("\n# Raster decode virtualisation");
  const result = await page.evaluate(async () => {
    const source = AN.state.pages[0];
    AN.state.pages = Array.from({ length: 10 }, (_, i) => ({ ...source, id: "virtual-page-" + i }));
    AN.state.anns = []; AN.emit("rerender");
    await new Promise(resolve => setTimeout(resolve, 150));
    const images = Array.from(document.querySelectorAll("#pages img.bg"));
    const initialLoaded = images.filter(img => img.hasAttribute("src")).length;
    const lastInitiallyLoaded = images[images.length - 1].hasAttribute("src");
    const exported = AN.io.buildHtml();
    const doc = new DOMParser().parseFromString(exported, "text/html");
    const exportedImages = Array.from(doc.querySelectorAll(".export-doc img.bg"));
    AN.editor.loadAllBackgrounds();
    const printLoaded = images.filter(img => img.hasAttribute("src")).length;
    const portableBytes = JSON.stringify(AN.serialize()).length;
    await AN.autosaveNow();
    const storedBytes = await new Promise(resolve => {
      const req = indexedDB.open("annotate-db", 3);
      req.onsuccess = () => {
        const get = req.result.transaction("sessions", "readonly").objectStore("sessions").get("current");
        get.onsuccess = () => resolve(JSON.stringify(get.result).length + get.result.pages.reduce((n, p) => n + (p.bgBlob ? p.bgBlob.size : 0), 0));
      };
    });
    return {
      total: images.length, initialLoaded, lastInitiallyLoaded,
      exported: exportedImages.length,
      exportedWithSource: exportedImages.filter(img => /^data:image\//.test(img.getAttribute("src") || "")).length,
      printLoaded, portableBytes, storedBytes,
    };
  });
  check("distant raster pages remain undecoded", result.initialLoaded < result.total && !result.lastInitiallyLoaded, result.initialLoaded + " of " + result.total);
  check("standalone export includes every raster page", result.exported === result.total);
  check("standalone export materialises every background", result.exportedWithSource === result.total, result.exportedWithSource + " of " + result.total);
  check("print preparation materialises every background", result.printLoaded === result.total, result.printLoaded + " of " + result.total);
  const efficient = result.storedBytes < result.portableBytes || (browserName === "webkit" && result.storedBytes < result.portableBytes + 200);
  check("persistence uses blob compression or bounded WebKit fallback", efficient, result.storedBytes + " vs " + result.portableBytes);

  await browser.close();
  console.log("\n==== " + pass + " passed, " + fail + " failed ====");
  process.exit(fail ? 1 : 0);
})().catch(err => { console.error("HARNESS ERROR:", err); process.exit(1); });

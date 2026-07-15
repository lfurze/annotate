/* Annotate named local project and storage-management checks. Apache-2.0 */
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
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("dialog", dialog => dialog.accept());

  console.log("\n# IndexedDB v2 → v3 migration");
  await page.goto(BASE + "/test/empty-migration-setup");
  const seeded = await page.evaluate(() => new Promise(resolve => {
    const drop = indexedDB.deleteDatabase("annotate-db");
    drop.onerror = () => resolve(false);
    drop.onsuccess = () => {
      const req = indexedDB.open("annotate-db", 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore("sessions");
        const projects = db.createObjectStore("projects", { keyPath: "id" });
        projects.put({ id: "legacy", name: "Legacy project", savedAt: "2026-01-01T00:00:00.000Z", size: 100,
          data: { v: 1, title: "Migrated", nextId: 2, pages: [{ id: "p1", kind: "image", w: 10, h: 10, bg: "data:image/png;base64,iVBORw0KGgo=", html: null, pdfText: [], thumb: null }], anns: [] } });
      };
      req.onsuccess = () => { req.result.close(); resolve(true); };
      req.onerror = () => resolve(false);
    };
  }));
  check("legacy database fixture is created", seeded);
  await page.goto(BASE);
  const migrated = await page.evaluate(async () => {
    const list = await AN.listLocalProjects();
    const record = await AN.readLocalProject("legacy");
    return { count: list.length, metadataOnly: list[0] && !("data" in list[0]), title: record && record.data.title };
  });
  check("v2 embedded project data migrates to the v3 data store", migrated.count === 1 && migrated.metadataOnly && migrated.title === "Migrated", JSON.stringify(migrated));
  await page.evaluate(() => AN.deleteLocalProject("legacy"));

  await page.setInputFiles("#file-open", IMAGE);
  await page.waitForSelector(".page img.bg");
  await page.evaluate(() => {
    AN.addAnn({ page: AN.state.pages[0].id, type: "text", x: 40, y: 50, text: "Saved thought", color: "#e23b3b",
      fontFamily: AN.settings.fontFamily, fontSize: 16, bold: false, italic: false });
    AN.editor.renderAll();
  });

  console.log("\n# Named local save");
  await page.click("#btn-projects");
  await page.fill("#local-project-name", "Reading notes");
  await page.click('#save-local-form button[type="submit"]');
  await page.waitForSelector('.local-project-row[data-id]');
  const saved = await page.evaluate(() => ({
    rows: document.querySelectorAll(".local-project-row").length,
    name: document.querySelector(".local-project-info strong").textContent,
    summary: document.getElementById("storage-summary").textContent,
    clean: !AN.isDirty(),
  }));
  check("named project is listed", saved.rows === 1 && saved.name === "Reading notes");
  check("named project size and storage are summarised", /1 project/.test(saved.summary) && /named copies/.test(saved.summary), saved.summary);
  check("successful explicit local save establishes a clean baseline", saved.clean);
  const storageShape = await page.evaluate(() => new Promise(resolve => {
    const req = indexedDB.open("annotate-db", 3);
    req.onsuccess = () => {
      const tx = req.result.transaction(["projects", "project-data"], "readonly");
      const meta = tx.objectStore("projects").getAll(), data = tx.objectStore("project-data").getAll();
      tx.oncomplete = () => resolve({ metadataHasData: Object.prototype.hasOwnProperty.call(meta.result[0], "data"), blob: data.result[0].data.pages[0].bgBlob instanceof Blob, base64: /^data:image\//.test(data.result[0].data.pages[0].bg || "") });
      tx.onerror = () => resolve({ metadataHasData: true, blob: false });
    };
  }));
  check("project metadata is separated from supported document storage", !storageShape.metadataHasData && (storageShape.blob || (browserName === "webkit" && storageShape.base64)), JSON.stringify(storageShape));

  console.log("\n# Validated local reopen");
  await page.evaluate(() => AN.addAnn({ page: AN.state.pages[0].id, type: "note", x: 100, y: 100, w: 200, h: 120, text: "Unsaved", color: "#ffe14d" }));
  check("later edit marks project dirty", await page.evaluate(() => AN.isDirty()));
  await page.click(".local-project-row .tbtn:not(.danger)");
  await page.waitForFunction(() => !document.getElementById("projects-dialog").open);
  const reopened = await page.evaluate(() => ({ count: AN.state.anns.length, text: AN.state.anns[0].text, clean: !AN.isDirty() }));
  check("opening named project restores its validated snapshot", reopened.count === 1 && reopened.text === "Saved thought");
  check("opened named project begins clean", reopened.clean);

  console.log("\n# Explicit deletion");
  await page.click("#btn-projects");
  await page.click(".local-project-row .danger");
  await page.waitForSelector(".empty-local");
  const removed = await page.evaluate(async () => ({ rows: document.querySelectorAll(".local-project-row").length, records: (await AN.listLocalProjects()).length }));
  check("deletion removes UI row and IndexedDB record", removed.rows === 0 && removed.records === 0, JSON.stringify(removed));

  await browser.close();
  console.log("\n==== " + pass + " passed, " + fail + " failed ====");
  process.exit(fail ? 1 : 0);
})().catch(err => { console.error("HARNESS ERROR:", err); process.exit(1); });

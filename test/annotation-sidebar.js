/* Annotate annotation-sidebar navigation checks. Apache-2.0 */
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
  await page.goto(BASE);
  await page.setInputFiles("#file-open", PDF);
  await page.waitForSelector("#pages .page-slot:nth-child(2)");
  const ids = await page.evaluate(() => {
    const first = AN.state.pages[0].id, second = AN.state.pages[1].id;
    const a = AN.addAnn({ page: first, type: "highlight", color: "#ffe14d", width: 18, points: [[80, 100], [200, 100]] });
    const b = AN.addAnn({ page: second, type: "comment", x: 120, y: 140, text: "Evidence for the final claim", color: "#e23b3b", open: false });
    AN.editor.renderAll(); return { first: a.id, second: b.id };
  });

  console.log("\n# Annotation review and navigation");
  await page.click("#btn-annotations");
  const opened = await page.evaluate(() => ({
    hidden: document.getElementById("annotation-sidebar").hidden,
    expanded: document.getElementById("btn-annotations").getAttribute("aria-expanded"),
    count: document.querySelectorAll(".annotation-item").length,
    summary: document.getElementById("annotation-summary").textContent,
    preview: document.querySelector('[data-id="' + AN.state.anns[1].id + '"] .annotation-item-preview').textContent,
  }));
  check("sidebar opens with expanded state", !opened.hidden && opened.expanded === "true");
  check("sidebar lists every annotation", opened.count === 2 && /2 annotations/.test(opened.summary), opened.count + " / " + opened.summary);
  check("textual annotation preview is retained", /Evidence for the final claim/.test(opened.preview), opened.preview);

  await page.click('.annotation-item[data-id="' + ids.second + '"]');
  await page.waitForFunction(id => AN.editor.selectedId() === id, ids.second);
  const navigated = await page.evaluate(id => ({
    selected: AN.editor.selectedId(),
    pageLabel: document.getElementById("page-label").textContent,
    current: document.querySelector('.annotation-item[data-id="' + id + '"]').getAttribute("aria-current"),
  }), ids.second);
  check("sidebar item selects its annotation", navigated.selected === ids.second);
  check("sidebar item navigates to its page", navigated.pageLabel === "2 / 2", navigated.pageLabel);
  check("selected list item exposes current state", navigated.current === "true");

  await page.click("#btn-close-annotations");
  const closed = await page.evaluate(() => ({
    hidden: document.getElementById("annotation-sidebar").hidden,
    expanded: document.getElementById("btn-annotations").getAttribute("aria-expanded"),
    focus: document.activeElement.id,
  }));
  check("sidebar closes and restores trigger focus", closed.hidden && closed.expanded === "false" && closed.focus === "btn-annotations");

  await browser.close();
  console.log("\n==== " + pass + " passed, " + fail + " failed ====");
  process.exit(fail ? 1 : 0);
})().catch(err => { console.error("HARNESS ERROR:", err); process.exit(1); });

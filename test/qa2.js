/* Annotate — QA pass 2: edge cases. Run: node test/qa2.js */
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");
const BASE = "http://127.0.0.1:8777/index.html";
const SAMPLES = path.join(__dirname, "..", "samples");
const SHOTS = path.join(__dirname, "screenshots");

let pass = 0, fail = 0; const out = [];
function check(n, c, e) { if (c) { pass++; out.push("  ✅ " + n); } else { fail++; out.push("  ❌ " + n + (e ? " — " + e : "")); } }
async function toClient(page, nx, ny) { const i = await page.evaluate(() => { const r = document.querySelector(".page").getBoundingClientRect(); return { left: r.left, top: r.top, z: window.AN.settings.zoom }; }); return { x: i.left + nx * i.z, y: i.top + ny * i.z }; }
async function clickNat(page, x, y) { const c = await toClient(page, x, y); await page.mouse.click(c.x, c.y); }
async function dragNat(page, x1, y1, x2, y2) { const a = await toClient(page, x1, y1), b = await toClient(page, x2, y2); await page.mouse.move(a.x, a.y); await page.mouse.down(); for (let i = 1; i <= 10; i++) await page.mouse.move(a.x + (b.x - a.x) * i / 10, a.y + (b.y - a.y) * i / 10); await page.mouse.up(); }
async function dismiss(page) { if (await page.isVisible("#restore-banner")) await page.click("#restore-no"); }

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", e => errs.push(e.message)); page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });

  // ---- DOCX save/load roundtrip ----
  out.push("\n# DOCX save → load roundtrip (html-page persistence)");
  await page.goto(BASE, { waitUntil: "networkidle" }); await page.waitForTimeout(300); await dismiss(page);
  await page.setInputFiles("#file-open", path.join(SAMPLES, "sample.docx"));
  await page.waitForSelector(".page .bg-html"); await page.waitForTimeout(300);
  await page.click('.tool[data-tool="highlight"]');
  await dragNat(page, 60, 120, 360, 120);
  const cnt = await page.evaluate(() => window.AN.state.anns.length);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#btn-save")]);
  const sp = path.join(SHOTS, "docx-project.html"); await dl.saveAs(sp);
  const html = fs.readFileSync(sp, "utf8");
  check("docx export embeds html page text", html.includes("Sample DOCX"));
  check("docx export embeds state", html.includes('id="annotate-state"'));
  await page.goto(BASE, { waitUntil: "networkidle" }); await page.waitForTimeout(300); await dismiss(page);
  await page.setInputFiles("#file-load", sp); await page.waitForTimeout(500);
  check("docx project reloads page as html", await page.evaluate(() => !!document.querySelector(".page .bg-html")));
  check("docx project reloads annotations", await page.evaluate(() => window.AN.state.anns.length) === cnt);
  check("docx reloaded text intact", await page.evaluate(() => document.querySelector(".bg-html").textContent.includes("subheading")));

  // ---- live style edit of selected annotation ----
  out.push("\n# Live restyle of a selected annotation");
  await page.goto(BASE, { waitUntil: "networkidle" }); await page.waitForTimeout(300); await dismiss(page);
  await page.setInputFiles("#file-open", path.join(SAMPLES, "sample-image.png"));
  await page.waitForSelector(".page img.bg"); await page.waitForTimeout(300);
  await page.click('.tool[data-tool="rect"]');
  await dragNat(page, 100, 100, 300, 240);
  // it auto-selects after creation; switch to select and click it to be sure
  await page.click('.tool[data-tool="select"]');
  await clickNat(page, 100, 170);
  check("rect is selected", await page.evaluate(() => !!window.AN.editor.selectedId()));
  // click the blue swatch in the colour group
  await page.click('#color-swatches .swatch[data-color="#2f6fed"]');
  await page.waitForTimeout(100);
  check("selected rect colour changed to blue", await page.evaluate(() => { const a = window.AN.state.anns.find(x => x.type === "rect"); return a && a.color.toLowerCase() === "#2f6fed"; }));
  // change width via range
  await page.evaluate(() => { const r = document.getElementById("stroke-width"); r.value = 8; r.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.waitForTimeout(80);
  check("selected rect width changed", await page.evaluate(() => { const a = window.AN.state.anns.find(x => x.type === "rect"); return a && a.width === 8; }));

  // ---- note resize ----
  out.push("\n# Sticky note resize");
  await page.click('.tool[data-tool="note"]');
  await clickNat(page, 500, 300); await page.waitForTimeout(120);
  await page.keyboard.type("resize me"); await page.keyboard.press("Escape"); await page.waitForTimeout(120);
  await page.click('.tool[data-tool="select"]');
  await clickNat(page, 540, 330); // click the note to select
  await page.waitForTimeout(100);
  const w0 = await page.evaluate(() => { const a = window.AN.state.anns.find(x => x.type === "note"); return a.w; });
  // drag the bottom-right handle
  const noteBox = await page.evaluate(() => { const el = document.querySelector(".ann-note"); const r = el.getBoundingClientRect(); return { right: r.right, bottom: r.bottom }; });
  await page.mouse.move(noteBox.right - 3, noteBox.bottom - 3); await page.mouse.down();
  await page.mouse.move(noteBox.right + 80, noteBox.bottom + 60, { steps: 8 }); await page.mouse.up();
  await page.waitForTimeout(100);
  const w1 = await page.evaluate(() => { const a = window.AN.state.anns.find(x => x.type === "note"); return a.w; });
  check("note width increased after resize", w1 > w0 + 20, w0 + "->" + w1);

  // ---- zoom ----
  out.push("\n# Zoom");
  await page.click("#btn-zoom-in"); await page.click("#btn-zoom-in");
  check("zoom increased", await page.evaluate(() => window.AN.settings.zoom) > 1);
  await page.click("#zoom-label");
  check("zoom reset to 1", await page.evaluate(() => window.AN.settings.zoom) === 1);

  check("no console/page errors", errs.length === 0, errs.slice(0, 5).join(" | "));
  await browser.close();

  console.log(out.join("\n"));
  console.log("\n==== " + pass + " passed, " + fail + " failed ====");
  if (errs.length) console.log("\nErrors:\n" + errs.map(e => " - " + e).join("\n"));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("HARNESS ERROR:", e); process.exit(2); });

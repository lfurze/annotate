/* Annotate — automated QA via Playwright. Run: node test/qa.js */
const { browserType } = require("./browser");
const path = require("path");
const fs = require("fs");

const BASE = "http://127.0.0.1:8777/index.html";
const SHOTS = path.join(__dirname, "screenshots");
const SAMPLES = path.join(__dirname, "..", "samples");
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const results = [];
function check(name, cond, extra) {
  if (cond) { pass++; results.push("  ✅ " + name); }
  else { fail++; results.push("  ❌ " + name + (extra ? "  — " + extra : "")); }
}

async function pageBox(page) {
  return await page.evaluate(() => {
    const p = document.querySelector(".page");
    if (!p) return null;
    const r = p.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
}
// pt in page-natural coords -> client coords (account for zoom via bounding box & natural size)
async function toClient(page, nx, ny) {
  const info = await page.evaluate(() => {
    const p = document.querySelector(".page");
    const r = p.getBoundingClientRect();
    const z = window.AN.settings.zoom;
    return { left: r.left, top: r.top, z };
  });
  return { x: info.left + nx * info.z, y: info.top + ny * info.z };
}
async function drag(page, x1, y1, x2, y2, steps = 12) {
  const a = await toClient(page, x1, y1), b = await toClient(page, x2, y2);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) await page.mouse.move(a.x + (b.x - a.x) * i / steps, a.y + (b.y - a.y) * i / steps);
  await page.mouse.up();
}
async function clickAt(page, x, y) { const c = await toClient(page, x, y); await page.mouse.click(c.x, c.y); }
async function tool(page, t) { await page.click(`.tool[data-tool="${t}"]`); }
async function annCount(page) { return await page.evaluate(() => window.AN.state.anns.length); }

(async () => {
  const browser = await browserType.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("dialog", dialog => dialog.accept());

  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push("PAGEERROR: " + e.message));

  // ---------- load app ----------
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  results.push("\n# Startup");
  check("page title set", (await page.title()).includes("Annotate"));
  check("welcome visible", await page.isVisible("#welcome"));
  check("libs loaded (pdfjsLib & mammoth)", await page.evaluate(() => !!window.pdfjsLib && !!window.mammoth));
  await page.screenshot({ path: path.join(SHOTS, "01-welcome.png") });

  // ---------- open image ----------
  results.push("\n# Image import + annotate");
  await page.setInputFiles("#file-open", path.join(SAMPLES, "sample-image.png"));
  await page.waitForSelector(".page img.bg", { timeout: 8000 });
  await page.waitForTimeout(300);
  check("image page rendered", await page.evaluate(() => document.querySelectorAll(".page").length === 1));
  const box = await pageBox(page);
  check("page has size", box && box.w > 100 && box.h > 100, JSON.stringify(box));

  // pen
  await tool(page, "pen");
  await drag(page, 120, 120, 360, 260);
  await drag(page, 360, 120, 120, 260);
  // highlight
  await tool(page, "highlight");
  await drag(page, 120, 320, 500, 320);
  // rect
  await tool(page, "rect");
  await drag(page, 540, 120, 760, 280);
  // ellipse
  await tool(page, "ellipse");
  await drag(page, 560, 320, 740, 440);
  // arrow
  await tool(page, "arrow");
  await drag(page, 120, 480, 360, 560);
  // line
  await tool(page, "line");
  await drag(page, 400, 480, 620, 560);
  check("7 vector annotations created (2 pen + hl + rect + ellipse + arrow + line)", await annCount(page) === 7, "count=" + await annCount(page));

  // text
  await tool(page, "text");
  await clickAt(page, 160, 330);
  await page.waitForTimeout(150);
  await page.keyboard.type("Hello annotation");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);

  // note
  await tool(page, "note");
  await clickAt(page, 600, 500);
  await page.waitForTimeout(150);
  await page.keyboard.type("Sticky note text");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);

  // comment
  await tool(page, "comment");
  await clickAt(page, 300, 200);
  await page.waitForTimeout(150);
  await page.keyboard.type("A comment");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);

  const total = await annCount(page);
  check("10 total annotations (7 vector + text + note + comment)", total === 10, "count=" + total);
  check("text content stored", await page.evaluate(() => window.AN.state.anns.some(a => a.type === "text" && /Hello/.test(a.text))));
  check("note content stored", await page.evaluate(() => window.AN.state.anns.some(a => a.type === "note" && /Sticky/.test(a.text))));
  check("comment content stored", await page.evaluate(() => window.AN.state.anns.some(a => a.type === "comment" && /comment/.test(a.text))));
  const marginalia = await page.evaluate(() => ({
    rail: !!document.querySelector(".comment-rail .ann-comment"),
    anchor: !!document.querySelector(".comment-anchor"),
    oldPin: !!document.querySelector(".ann-comment .pin"),
  }));
  check("comments render as anchored marginalia", marginalia.rail && marginalia.anchor && !marginalia.oldPin, JSON.stringify(marginalia));
  await tool(page, "select");
  await page.screenshot({ path: path.join(SHOTS, "02-image-annotated.png") });

  // ---------- undo / redo ----------
  results.push("\n# Undo / redo");
  const before = await annCount(page);
  await page.keyboard.press("Meta+z");
  await page.waitForTimeout(100);
  const afterUndo = await annCount(page);
  check("undo removes last annotation", afterUndo === before - 1, before + "->" + afterUndo);
  await page.keyboard.press("Meta+Shift+z");
  await page.waitForTimeout(100);
  check("redo restores annotation", await annCount(page) === before);

  // ---------- selection + move + delete ----------
  results.push("\n# Select / move / delete");
  // select the rectangle by clicking near its border
  await tool(page, "select");
  await clickAt(page, 540, 200); // left border of rect (x from 540..760)
  await page.waitForTimeout(100);
  check("vector selected", await page.evaluate(() => !!window.AN.editor.selectedId()));
  const selId = await page.evaluate(() => window.AN.editor.selectedId());
  // delete it
  await page.keyboard.press("Delete");
  await page.waitForTimeout(100);
  check("delete removes selected", await page.evaluate((id) => !window.AN.getAnn(id), selId));

  // ---------- save roundtrip ----------
  results.push("\n# Save → reload → load roundtrip");
  const countBeforeSave = await annCount(page);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.click("#btn-save"),
  ]);
  const savedPath = path.join(SHOTS, "saved-project.html");
  await download.saveAs(savedPath);
  const savedHtml = fs.readFileSync(savedPath, "utf8");
  check("saved file is non-trivial", savedHtml.length > 5000, "len=" + savedHtml.length);
  check("saved file embeds state json", savedHtml.includes('id="annotate-state"'));
  check("saved file embeds bg image data", savedHtml.includes("data:image"));
  check("saved file is viewable (has .page)", /class="[^"]*\bpage\b/.test(savedHtml));
  check("saved file preserves the margin comment rail", savedHtml.includes("comment-rail") && !savedHtml.includes('class="pin"'));

  // open the saved file standalone -> should render annotations with no JS errors from app
  const viewPage = await ctx.newPage();
  const viewErrors = [];
  viewPage.on("pageerror", (e) => viewErrors.push(e.message));
  await viewPage.goto("file://" + savedPath, { waitUntil: "load" });
  await viewPage.waitForTimeout(300);
  check("standalone file renders pages", await viewPage.evaluate(() => document.querySelectorAll(".page").length === 1));
  check("standalone file shows annotations", await viewPage.evaluate(() => document.querySelectorAll(".ann, .vector path, .vector rect, .vector ellipse, .vector line").length > 0));
  check("standalone file no JS errors", viewErrors.length === 0, viewErrors.join("; "));
  await viewPage.screenshot({ path: path.join(SHOTS, "03-standalone-view.png"), fullPage: true });
  await viewPage.close();

  // reload editor and load the saved project
  await page.goto(BASE, { waitUntil: "networkidle" });
  // dismiss restore banner if shown
  await page.waitForTimeout(400);
  if (await page.isVisible("#restore-banner")) await page.click("#restore-no");
  await page.setInputFiles("#file-load", savedPath);
  await page.waitForTimeout(500);
  const reloaded = await annCount(page);
  check("loaded project restores annotation count", reloaded === countBeforeSave, "expected " + countBeforeSave + " got " + reloaded);
  check("loaded project restores page", await page.evaluate(() => document.querySelectorAll(".page").length === 1));
  await page.screenshot({ path: path.join(SHOTS, "04-reloaded.png") });

  // ---------- PDF import ----------
  results.push("\n# PDF import");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  if (await page.isVisible("#restore-banner")) await page.click("#restore-no");
  await page.setInputFiles("#file-open", path.join(SAMPLES, "sample.pdf"));
  await page.waitForSelector(".page img.bg", { timeout: 12000 });
  await page.waitForTimeout(400);
  check("PDF rendered 2 pages", await page.evaluate(() => document.querySelectorAll(".page").length === 2), "pages=" + await page.evaluate(() => document.querySelectorAll(".page").length));
  await tool(page, "highlight");
  await drag(page, 80, 100, 380, 100);
  check("can annotate PDF", await annCount(page) >= 1);
  await page.screenshot({ path: path.join(SHOTS, "05-pdf.png") });

  // ---------- DOCX import ----------
  results.push("\n# DOCX import");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  if (await page.isVisible("#restore-banner")) await page.click("#restore-no");
  await page.setInputFiles("#file-open", path.join(SAMPLES, "sample.docx"));
  await page.waitForSelector(".page .bg-html", { timeout: 8000 });
  await page.waitForTimeout(300);
  check("DOCX rendered as html page", await page.evaluate(() => !!document.querySelector(".page .bg-html") && document.querySelector(".bg-html").textContent.includes("Sample DOCX")));
  await tool(page, "comment");
  await clickAt(page, 200, 150);
  await page.waitForTimeout(120);
  await page.keyboard.type("Comment on docx");
  await page.keyboard.press("Escape");
  check("can annotate DOCX", await annCount(page) >= 1);
  await page.screenshot({ path: path.join(SHOTS, "06-docx.png") });

  // ---------- console errors ----------
  results.push("\n# Console");
  check("no console/page errors during session", consoleErrors.length === 0, consoleErrors.slice(0, 6).join(" | "));

  await browser.close();

  // ---------- report ----------
  console.log(results.join("\n"));
  console.log("\n==== " + pass + " passed, " + fail + " failed ====");
  if (consoleErrors.length) { console.log("\nConsole errors:\n" + consoleErrors.map(e => " - " + e).join("\n")); }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("HARNESS ERROR:", e); process.exit(2); });

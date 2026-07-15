/* Annotate — QA pass 3: touch & mobile. Run: node test/qa3.js */
const { browserType } = require("./browser");
const path = require("path");
const BASE = "http://127.0.0.1:8777/index.html";
const SAMPLES = path.join(__dirname, "..", "samples");
const SHOTS = path.join(__dirname, "screenshots");

let pass = 0, fail = 0; const out = [];
function check(n, c, e) { if (c) { pass++; out.push("  ✅ " + n); } else { fail++; out.push("  ❌ " + n + (e ? " — " + e : "")); } }

// Inject a synthetic touch-pointer simulator into the page.
async function installSim(page) {
  await page.evaluate(() => {
    window.__sim = (type, id, x, y) => {
      const target = type === "pointerdown" ? (document.elementFromPoint(x, y) || document) : document;
      const ev = new PointerEvent(type, { pointerId: id, pointerType: "touch", clientX: x, clientY: y,
        isPrimary: id === 1, bubbles: true, cancelable: true, button: 0, buttons: type === "pointerup" ? 0 : 1 });
      target.dispatchEvent(ev);
    };
  });
}
const wait = (p, ms) => p.waitForTimeout(ms);

(async () => {
  const browser = await browserType.launch();
  const ctx = await browser.newContext({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", e => errs.push(e.message)); page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });

  await page.goto(BASE, { waitUntil: "networkidle" }); await wait(page, 400);

  // ---- responsive layout / detection ----
  out.push("\n# Mobile layout & touch detection");
  check("body.is-touch applied", await page.evaluate(() => document.body.classList.contains("is-touch")));
  check("touch hint shown first run", await page.isVisible(".touch-hint"));
  // tool rail sits BELOW the viewport (bottom bar), not to the left
  const layout = await page.evaluate(() => {
    const tr = document.getElementById("toolrail").getBoundingClientRect();
    const vp = document.getElementById("viewport").getBoundingClientRect();
    return { railTop: tr.top, vpTop: vp.top, railLeft: tr.left, railWide: tr.width };
  });
  check("tool rail is a bottom bar (below viewport)", layout.railTop > layout.vpTop && layout.railWide > 300, JSON.stringify(layout));
  check("compact top bar uses short labels", await page.evaluate(() => {
    const f = getComputedStyle(document.querySelector("#btn-open .lbl-full")).display;
    const s = getComputedStyle(document.querySelector("#btn-open .lbl-short")).display;
    return f === "none" && s !== "none";
  }));
  await page.screenshot({ path: path.join(SHOTS, "07-mobile-welcome.png") });
  // dismiss hint
  await page.click(".touch-hint button");
  check("hint dismissable", !(await page.isVisible(".touch-hint")));

  // ---- open an image ----
  await page.setInputFiles("#file-open", path.join(SAMPLES, "sample-image.png"));
  await page.waitForSelector(".page img.bg"); await wait(page, 300);
  await installSim(page);
  const annCount = () => page.evaluate(() => window.AN.state.anns.length);

  // ---- one-finger draw still works (arrow committed on up) ----
  out.push("\n# One-finger drawing");
  await page.tap('.tool[data-tool="arrow"]');
  const vpRect = await page.evaluate(() => { const r = document.getElementById("viewport").getBoundingClientRect(); return { x: r.x, y: r.y }; });
  // draw within the page area (use client coords on screen)
  await page.evaluate(() => { window.__sim("pointerdown", 1, 120, 300); });
  await page.evaluate(() => { window.__sim("pointermove", 1, 240, 360); });
  await page.evaluate(() => { window.__sim("pointermove", 1, 300, 420); });
  await page.evaluate(() => { window.__sim("pointerup", 1, 300, 420); });
  await wait(page, 80);
  check("one-finger arrow committed", await annCount() === 1, "count=" + await annCount());

  // ---- one-finger pan in Select mode scrolls (no annotation) ----
  out.push("\n# One-finger pan (Select mode)");
  await page.tap('.tool[data-tool="select"]');
  const sl0 = await page.evaluate(() => document.getElementById("viewport").scrollLeft);
  await page.evaluate(() => { window.__sim("pointerdown", 1, 300, 400); });
  for (let x = 290; x >= 120; x -= 30) await page.evaluate((x) => window.__sim("pointermove", 1, x, 400), x);
  await page.evaluate(() => { window.__sim("pointerup", 1, 120, 400); });
  await wait(page, 80);
  const sl1 = await page.evaluate(() => document.getElementById("viewport").scrollLeft);
  check("one-finger drag pans (scrollLeft increased)", sl1 > sl0 + 30, sl0 + "->" + sl1);
  check("panning created no annotation", await annCount() === 1, "count=" + await annCount());

  // ---- two-finger pinch zoom ----
  out.push("\n# Two-finger pinch-zoom");
  const z0 = await page.evaluate(() => window.AN.settings.zoom);
  await page.evaluate(() => { window.__sim("pointerdown", 1, 180, 400); window.__sim("pointerdown", 2, 240, 460); });
  // spread fingers apart over several frames
  const steps = [[160, 380, 260, 480], [140, 360, 280, 500], [110, 330, 320, 540], [80, 300, 360, 580]];
  for (const s of steps) { await page.evaluate((s) => { window.__sim("pointermove", 1, s[0], s[1]); window.__sim("pointermove", 2, s[2], s[3]); }, s); await wait(page, 40); }
  await page.evaluate(() => { window.__sim("pointerup", 1, 80, 300); window.__sim("pointerup", 2, 360, 580); });
  await wait(page, 80);
  const z1 = await page.evaluate(() => window.AN.settings.zoom);
  check("pinch increased zoom", z1 > z0 + 0.1, z0 + "->" + z1);

  // ---- two-finger gesture cancels an accidental stroke ----
  out.push("\n# Two-finger gesture cancels accidental stroke");
  await page.tap('.tool[data-tool="arrow"]');
  const before = await annCount();
  await page.evaluate(() => { window.__sim("pointerdown", 1, 150, 350); window.__sim("pointermove", 1, 200, 400); }); // start drawing
  await wait(page, 30);
  await page.evaluate(() => { window.__sim("pointerdown", 2, 260, 460); });  // second finger → should cancel the stroke
  await page.evaluate(() => { window.__sim("pointermove", 1, 120, 320); window.__sim("pointermove", 2, 300, 520); });
  await wait(page, 40);
  await page.evaluate(() => { window.__sim("pointerup", 1, 120, 320); window.__sim("pointerup", 2, 300, 520); });
  await wait(page, 80);
  check("no stray arrow from 2-finger gesture", await annCount() === before, "before=" + before + " after=" + await annCount());

  await page.screenshot({ path: path.join(SHOTS, "08-mobile-annotated.png") });
  check("no console/page errors", errs.length === 0, errs.slice(0, 5).join(" | "));

  await browser.close();
  console.log(out.join("\n"));
  console.log("\n==== " + pass + " passed, " + fail + " failed ====");
  if (errs.length) console.log("\nErrors:\n" + errs.map(e => " - " + e).join("\n"));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("HARNESS ERROR:", e); process.exit(2); });

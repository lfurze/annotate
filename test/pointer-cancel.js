/* Annotate interrupted pointer-operation regressions. Apache-2.0 */
const { browserType } = require("./browser");
const path = require("path");

const BASE = process.env.ANNOTATE_URL || "http://127.0.0.1:8777";
const SAMPLE = path.join(__dirname, "..", "samples", "sample-image.png");
let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log("  ✅ " + name); }
  else { fail++; console.log("  ❌ " + name + (detail ? " — " + detail : "")); }
}

(async () => {
  const browser = await browserType.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
  page.on("dialog", d => d.accept());
  await page.goto(BASE);
  await page.setInputFiles("#file-open", SAMPLE);
  await page.waitForSelector(".page img.bg");

  console.log("\n# Cancel in-progress drawing");
  const drawing = await page.evaluate(() => {
    AN.setTool("pen");
    const pageEl = document.querySelector(".page"), r = pageEl.getBoundingClientRect();
    const count = AN.state.anns.length;
    pageEl.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 41, pointerType: "pen", button: 0, buttons: 1, clientX: r.left + 100, clientY: r.top + 100 }));
    document.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 41, pointerType: "pen", buttons: 1, clientX: r.left + 180, clientY: r.top + 160 }));
    document.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 41, pointerType: "pen", clientX: r.left + 180, clientY: r.top + 160 }));
    return { countBefore: count, countAfter: AN.state.anns.length, previews: document.querySelectorAll("svg.vector [data-id]").length };
  });
  check("cancelled stroke is not committed", drawing.countAfter === drawing.countBefore);
  check("cancelled stroke preview is removed", drawing.previews === 0, String(drawing.previews));

  console.log("\n# Cancel annotation movement");
  const movement = await page.evaluate(() => {
    const pageId = AN.state.pages[0].id;
    const ann = AN.addAnn({ page: pageId, type: "rect", x: 100, y: 100, w: 100, h: 80, color: "#e23b3b", width: 3 });
    AN.editor.renderAll(); AN.setTool("select");
    const before = JSON.stringify(ann), pageEl = document.querySelector(".page"), r = pageEl.getBoundingClientRect();
    pageEl.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 42, pointerType: "mouse", button: 0, buttons: 1, clientX: r.left + 120, clientY: r.top + 120 }));
    document.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 42, pointerType: "mouse", buttons: 1, clientX: r.left + 220, clientY: r.top + 210 }));
    const moved = ann.x !== 100 || ann.y !== 100;
    document.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 42, pointerType: "mouse" }));
    return { moved, restored: JSON.stringify(ann) === before };
  });
  check("vector moved before interruption", movement.moved);
  check("cancelled vector movement restores geometry", movement.restored);

  console.log("\n# Cancel note resize");
  const resize = await page.evaluate(() => {
    const pageId = AN.state.pages[0].id;
    const ann = AN.addAnn({ page: pageId, type: "note", x: 300, y: 180, w: 200, h: 120, text: "note", color: "#ffe14d" });
    AN.editor.renderAll(); AN.setTool("select"); AN.editor.selectAnn(ann.id);
    const handle = document.querySelector('.ann[data-id="' + ann.id + '"] .handle.br');
    const r = handle.getBoundingClientRect(), before = { w: ann.w, h: ann.h };
    handle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 43, pointerType: "touch", button: 0, buttons: 1, clientX: r.left + 2, clientY: r.top + 2 }));
    document.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 43, pointerType: "touch", buttons: 1, clientX: r.left + 102, clientY: r.top + 82 }));
    const changed = ann.w !== before.w || ann.h !== before.h;
    document.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 43, pointerType: "touch" }));
    const node = document.querySelector('.ann[data-id="' + ann.id + '"]');
    return { changed, restored: ann.w === before.w && ann.h === before.h, domWidth: Math.round(node.offsetWidth) };
  });
  check("note resized before interruption", resize.changed);
  check("cancelled note resize restores state", resize.restored);
  check("cancelled note resize restores rendered width", Math.abs(resize.domWidth - 200) < 4, String(resize.domWidth));

  console.log("\n# Continuous control undo coalescing");
  const coalesced = await page.evaluate(() => {
    const rect = AN.state.anns.find(a => a.type === "rect");
    AN.editor.selectAnn(rect.id);
    const original = rect.width, slider = document.getElementById("stroke-width");
    slider.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 44, pointerType: "mouse", button: 0, buttons: 1 }));
    [7, 11, 15].forEach(value => { slider.value = value; slider.dispatchEvent(new Event("input", { bubbles: true })); });
    slider.dispatchEvent(new Event("change", { bubbles: true }));
    const final = rect.width;
    AN.undo();
    const restored = AN.getAnn(rect.id).width;
    return { original, final, restored };
  });
  check("continuous width control reaches final value", coalesced.final === 15, String(coalesced.final));
  check("one undo restores pre-drag width", coalesced.restored === coalesced.original, coalesced.restored + " vs " + coalesced.original);

  await browser.close();
  console.log("\n==== " + pass + " passed, " + fail + " failed ====");
  process.exit(fail ? 1 : 0);
})().catch(err => { console.error("HARNESS ERROR:", err); process.exit(1); });

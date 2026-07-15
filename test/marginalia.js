/* Annotate margin-comment layout, interaction, and export checks. Apache-2.0 */
const { browserType } = require("./browser");
const path = require("path");
const BASE = process.env.ANNOTATE_URL || "http://127.0.0.1:8777";
const IMAGE = path.join(__dirname, "..", "samples", "sample-image.png");
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log("  ✅ " + name); } else { fail++; console.log("  ❌ " + name + (detail ? " — " + detail : "")); } }

(async () => {
  const browser = await browserType.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(BASE); await page.setInputFiles("#file-open", IMAGE); await page.waitForSelector(".page");
  const result = await page.evaluate(() => {
    const pg = AN.state.pages[0];
    const first = AN.addAnn({ page: pg.id, type: "comment", x: 120, y: 40, text: "Long comment ".repeat(45), color: "#fff3b0", open: true });
    AN.addAnn({ page: pg.id, type: "comment", x: 150, y: 60, text: "Second comment", color: "#e23b3b", open: false });
    for (let i = 0; i < 6; i++) AN.addAnn({ page: pg.id, type: "comment", x: 180, y: 90 + i * 20, text: "Additional comment " + i, color: "#2f6fed", open: true });
    AN.editor.renderAll();
    const cards = Array.from(document.querySelectorAll(".comment-rail .ann-comment"));
    const boxes = cards.map(card => card.getBoundingClientRect());
    const noOverlap = boxes.every((box, i) => !i || box.top >= boxes[i - 1].bottom);
    const overflow = document.querySelector(".page").classList.contains("comments-overflow") && document.querySelector(".comment-appendix.active");
    const anchor = document.querySelector('[data-comment-id="' + first.id + '"]');
    anchor.focus(); anchor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    const moved = AN.getAnn(first.id).x === 121;
    const html = AN.io.buildHtml(), doc = new DOMParser().parseFromString(html, "text/html");
    const staticOk = !doc.querySelector("button.comment-anchor") && !doc.querySelector(".ann-comment[tabindex]") && !!doc.querySelector(".comment-appendix");
    const yellowForeground = getComputedStyle(document.querySelector('[data-comment-id="' + first.id + '"]')).color;
    AN.editor.selectAnn(first.id); AN.editor.deleteSelected();
    const deletedCleanly = !AN.getAnn(first.id) && !document.querySelector('[data-comment-id="' + first.id + '"]') && !document.querySelector('[data-id="' + first.id + '"]');
    return { noOverlap, overflow: !!overflow, moved, staticOk, deletedCleanly, yellowForeground };
  });
  check("measured margin cards do not overlap", result.noOverlap, JSON.stringify(result));
  check("dense comments switch to a printable continuation appendix", result.overflow);
  check("keyboard arrows reposition a document anchor", result.moved);
  check("standalone export has no dead comment controls", result.staticOk);
  check("deleting a comment removes its anchor and card", result.deletedCleanly);
  check("light custom colours receive dark number text", result.yellowForeground === "rgb(17, 24, 39)", result.yellowForeground);
  await browser.close();
  console.log("\n==== " + pass + " passed, " + fail + " failed ===="); process.exit(fail ? 1 : 0);
})().catch(error => { console.error("HARNESS ERROR:", error); process.exit(1); });

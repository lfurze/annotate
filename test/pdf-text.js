/* Annotate selectable PDF text and path-storage checks. Apache-2.0 */
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
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.goto(BASE);
  await page.setInputFiles("#file-open", PDF);
  await page.waitForSelector(".pdf-text-layer span");

  console.log("\n# Selectable and persistent PDF text");
  const text = await page.evaluate(() => {
    const layer = document.querySelector(".pdf-text-layer");
    const spans = Array.from(layer.querySelectorAll("span"));
    const range = document.createRange(); range.selectNodeContents(layer);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    const exported = AN.io.buildHtml();
    const roundTrip = AN.security.validateSerialized(JSON.parse(JSON.stringify(AN.serialize())));
    return {
      stateItems: AN.state.pages.reduce((n, p) => n + p.pdfText.length, 0),
      domText: spans.map(s => s.textContent).join(" "),
      selectedText: selection.toString(),
      findResult: typeof window.find === "function" ? window.find("quick brown fox", false, false, true) : null,
      exportHasLayer: exported.includes("pdf-text-layer") && exported.includes("quick brown fox"),
      roundTripItems: roundTrip.pages.reduce((n, p) => n + p.pdfText.length, 0),
    };
  });
  check("PDF import stores text items", text.stateItems >= 4, String(text.stateItems));
  check("PDF text is represented in the DOM", /Sample PDF - Page 1/.test(text.domText));
  check("PDF text can be selected", /quick brown fox/.test(text.selectedText));
  check("browser find can locate PDF text", text.findResult !== false, String(text.findResult));
  check("standalone export retains PDF text", text.exportHasLayer);
  check("validated project round trip retains PDF text", text.roundTripItems === text.stateItems, text.roundTripItems + " vs " + text.stateItems);

  console.log("\n# Freehand storage simplification");
  const simplified = await page.evaluate(() => {
    AN.setTool("pen");
    const pageEl = document.querySelector(".page"), r = pageEl.getBoundingClientRect();
    pageEl.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 71, pointerType: "pen", button: 0, buttons: 1, clientX: r.left + 50, clientY: r.top + 100 }));
    for (let i = 1; i <= 100; i++) document.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 71, pointerType: "pen", buttons: 1, clientX: r.left + 50 + i * 2, clientY: r.top + 100 }));
    document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 71, pointerType: "pen", clientX: r.left + 250, clientY: r.top + 100 }));
    const ann = AN.state.anns[AN.state.anns.length - 1];
    return { type: ann.type, points: ann.points.length };
  });
  check("completed freehand path remains a pen annotation", simplified.type === "pen");
  check("collinear freehand points are reduced", simplified.points <= 3, String(simplified.points));

  await browser.close();
  console.log("\n==== " + pass + " passed, " + fail + " failed ====");
  process.exit(fail ? 1 : 0);
})().catch(err => { console.error("HARNESS ERROR:", err); process.exit(1); });

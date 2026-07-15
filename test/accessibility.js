/* Annotate foundational accessibility regressions. Apache-2.0 */
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
  const page = await browser.newPage();
  await page.goto(BASE);

  console.log("\n# Accessible controls and status");
  const audit = await page.evaluate(() => {
    const unnamedButtons = Array.from(document.querySelectorAll("button")).filter(b =>
      !(b.getAttribute("aria-label") || b.getAttribute("aria-labelledby") || b.textContent.trim() || b.title)
    ).length;
    const unnamedInputs = Array.from(document.querySelectorAll('input:not([type="file"]) , select')).filter(el => {
      if (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby")) return false;
      return !el.labels || !el.labels.length;
    }).length;
    return {
      unnamedButtons, unnamedInputs,
      toastLive: document.getElementById("toast").getAttribute("aria-live"),
      autosaveRole: document.getElementById("autosave-status").getAttribute("role"),
      zoomTag: document.getElementById("zoom-label").tagName,
    };
  });
  check("all buttons have accessible names", audit.unnamedButtons === 0, String(audit.unnamedButtons));
  check("all property inputs have accessible names", audit.unnamedInputs === 0, String(audit.unnamedInputs));
  check("toast is announced politely", audit.toastLive === "polite");
  check("autosave status has status semantics", audit.autosaveRole === "status");
  check("zoom reset is keyboard operable", audit.zoomTag === "BUTTON", audit.zoomTag);

  console.log("\n# Keyboard focus and pressed state");
  // Safari/WebKit on macOS uses Option-Tab when the system preference for
  // tabbing through every control is disabled; other engines use plain Tab.
  await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
  const focus = await page.evaluate(() => {
    const el = document.activeElement, style = getComputedStyle(el);
    return { tag: el.tagName, outline: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  check("tab reaches an interactive control", focus.tag === "BUTTON", focus.tag);
  check("focused control has a visible outline", focus.outline !== "none" && focus.width >= 2, focus.outline + " " + focus.width);
  await page.click('.tool[data-tool="pen"]');
  const pressed = await page.evaluate(() => ({
    pen: document.querySelector('.tool[data-tool="pen"]').getAttribute("aria-pressed"),
    select: document.querySelector('.tool[data-tool="select"]').getAttribute("aria-pressed"),
    swatches: Array.from(document.querySelectorAll(".swatch")).every(s => s.hasAttribute("aria-pressed")),
  }));
  check("active tool exposes pressed state", pressed.pen === "true" && pressed.select === "false");
  check("colour swatches expose pressed state", pressed.swatches);

  console.log("\n# Contrast and constrained viewport");
  const contrast = await page.evaluate(() => {
    function rgb(value) { value = value.trim(); if (/^#[0-9a-f]{6}$/i.test(value)) return [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16)); return value.match(/\d+(?:\.\d+)?/g).map(Number).slice(0, 3); }
    function luminance(value) { return rgb(value).map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0); }
    function ratio(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
    const style = getComputedStyle(document.documentElement), white = "rgb(255, 255, 255)";
    return { accent: ratio(style.getPropertyValue("--accent"), white), danger: ratio(style.getPropertyValue("--danger"), white), muted: ratio(style.getPropertyValue("--muted"), white) };
  });
  check("core text colours meet 4.5:1 against white", Math.min(contrast.accent, contrast.danger, contrast.muted) >= 4.5, JSON.stringify(contrast));
  await page.setViewportSize({ width: 700, height: 360 });
  await page.waitForFunction(() => !document.getElementById("btn-mobile-actions").hidden);
  const reflow = await page.evaluate(() => { const bar = document.getElementById("topbar"); return { client: bar.clientWidth, scroll: bar.scrollWidth, more: !document.getElementById("btn-mobile-actions").hidden }; });
  check("application controls reflow without a horizontal topbar", reflow.more && reflow.scroll <= reflow.client, JSON.stringify(reflow));
  await page.click("#btn-mobile-actions");
  await page.click("#btn-help");
  const dialog = await page.evaluate(() => { const d = document.getElementById("help-dialog"), s = getComputedStyle(d); return { open: d.open, bottom: d.getBoundingClientRect().bottom, viewport: innerHeight, overflow: s.overflowY, scrollable: d.scrollHeight > d.clientHeight }; });
  check("help remains contained and scrollable in a 200%-equivalent viewport", dialog.open && dialog.bottom <= dialog.viewport + 1 && dialog.overflow === "auto" && dialog.scrollable, JSON.stringify(dialog));
  await page.keyboard.press("Escape");
  const welcome = await page.evaluate(() => { const viewport = document.getElementById("viewport").getBoundingClientRect(), card = document.querySelector(".welcome-card").getBoundingClientRect(); return { viewportTop: viewport.top, cardTop: card.top, canScroll: document.getElementById("welcome").scrollHeight >= document.getElementById("welcome").clientHeight }; });
  check("oversized welcome content starts inside the scrollable viewport", welcome.cardTop >= welcome.viewportTop, JSON.stringify(welcome));

  console.log("\n# Keyboard annotation editing");
  await page.setInputFiles("#file-open", IMAGE); await page.waitForSelector(".page img.bg");
  await page.evaluate(() => { const pg = AN.state.pages[0]; AN.addAnn({ page: pg.id, type: "text", x: 20, y: 20, text: "Keyboard note", color: "#1f2430", fontFamily: AN.settings.fontFamily, fontSize: 16, bold: false, italic: false }); AN.editor.renderAll(); });
  const annotation = page.locator(".ann-text"); await annotation.focus(); await page.keyboard.press("Shift+ArrowRight");
  const moved = await page.evaluate(() => AN.state.anns[0].x);
  check("focused text annotation moves by keyboard", moved === 30, String(moved));
  await page.keyboard.press("Enter"); await page.waitForSelector('.ann-text[contenteditable="true"]');
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A"); await page.keyboard.type("Edited by keyboard"); await page.keyboard.press("Tab");
  check("text annotation enters and saves keyboard editing", await page.evaluate(() => AN.state.anns[0].text === "Edited by keyboard"));

  await page.emulateMedia({ reducedMotion: "reduce" });
  const reduced = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".toast")).transitionDuration) <= 0.001);
  check("reduced-motion preference suppresses UI transitions", reduced);

  await browser.close();
  console.log("\n==== " + pass + " passed, " + fail + " failed ====");
  process.exit(fail ? 1 : 0);
})().catch(err => { console.error("HARNESS ERROR:", err); process.exit(1); });

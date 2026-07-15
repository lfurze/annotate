/* Annotate import cancellation and recovery checks. Apache-2.0 */
const { browserType } = require("./browser");
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
  page.on("dialog", d => d.accept());
  await page.goto(BASE);
  await page.setInputFiles("#file-open", IMAGE);
  await page.waitForSelector(".page img.bg");
  const before = await page.evaluate(() => ({ title: AN.state.title, page: AN.state.pages[0].id }));

  console.log("\n# Import cancellation and view recovery");
  await page.evaluate(() => {
    const original = AN.importFile;
    AN.importFile = async function (_file, progress, shouldCancel) {
      try {
        if (progress) progress(1, 100);
        while (!shouldCancel()) await new Promise(resolve => setTimeout(resolve, 20));
        const error = new Error("Import cancelled."); error.name = "AbortError"; throw error;
      } finally { AN.importFile = original; }
    };
  });
  await page.setInputFiles("#file-open", IMAGE);
  await page.waitForSelector(".cancel-import");
  const loading = await page.evaluate(() => ({
    text: document.querySelector(".page-loading").textContent,
    role: document.querySelector(".page-loading").getAttribute("role"),
  }));
  check("loading progress is exposed as status", loading.role === "status" && /1 of 100/.test(loading.text), loading.text);
  await page.click(".cancel-import");
  await page.waitForSelector(".page img.bg");
  const after = await page.evaluate(() => ({
    title: AN.state.title, page: AN.state.pages[0].id,
    loadingPresent: !!document.querySelector(".page-loading"),
    toast: document.getElementById("toast").textContent,
  }));
  check("cancelled import preserves the prior project", after.title === before.title && after.page === before.page);
  check("cancelled import restores the prior rendered view", !after.loadingPresent);
  check("cancellation is reported without an error state", /cancelled/i.test(after.toast), after.toast);

  await browser.close();
  console.log("\n==== " + pass + " passed, " + fail + " failed ====");
  process.exit(fail ? 1 : 0);
})().catch(err => { console.error("HARNESS ERROR:", err); process.exit(1); });

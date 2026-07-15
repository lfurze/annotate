/* Runtime network-boundary regression across every supported import type. Apache-2.0 */
const { browserType } = require("./browser");
const path = require("path");
const BASE = process.env.ANNOTATE_URL || "http://127.0.0.1:8777";
const ROOT = path.join(__dirname, "..", "samples");

(async () => {
  const browser = await browserType.launch({ headless: true });
  const page = await browser.newPage();
  const requests = [];
  page.on("request", request => requests.push(request.url()));
  page.on("dialog", dialog => dialog.accept());
  await page.goto(BASE);
  for (const file of ["sample.pdf", "sample.docx", "sample-image.png"]) {
    await page.setInputFiles("#file-open", path.join(ROOT, file));
    await page.waitForFunction(name => AN.state.title === name.replace(/\.[^.]+$/, ""), file);
  }
  const origin = new URL(BASE).origin;
  const exact = new Set(["/", "/index.html", "/css/styles.css", "/assets/favicon.svg", "/js/pdf-loader.mjs", "/js/docx-worker.js", "/js/state.js", "/js/security.js", "/js/import.js", "/js/editor.js", "/js/io.js", "/js/app.js", "/js/projects.js", "/js/pages.js", "/js/sidebar.js", "/js/gestures.js", "/vendor/pdf.min.mjs", "/vendor/pdf.worker.min.mjs", "/vendor/mammoth.browser.min.js"]);
  const unexpected = requests.filter(value => {
    if (/^(?:blob:|data:)/.test(value)) return false;
    const url = new URL(value);
    if (url.origin !== origin) return true;
    return !exact.has(url.pathname) && !url.pathname.startsWith("/vendor/pdfjs/");
  });
  await browser.close();
  if (unexpected.length) { console.error("Unexpected runtime request(s):\n" + unexpected.join("\n")); process.exit(1); }
  console.log("✅ PDF, DOCX, and image imports make only allowlisted local asset requests");
})().catch(error => { console.error("HARNESS ERROR:", error); process.exit(1); });

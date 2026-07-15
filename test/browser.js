/* Shared Playwright browser selection. Apache-2.0 */
const playwright = require("playwright");
const browserName = (process.env.BROWSER || "chromium").toLowerCase();
if (!playwright[browserName]) throw new Error("Unsupported BROWSER=" + browserName);
module.exports = { browserName, browserType: playwright[browserName] };

/* Verify exact vendored runtime files and required licence/resources. Apache-2.0 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ROOT = path.join(__dirname, "..");

const expectedFiles = {
  "vendor/pdf.min.mjs": "b0fc97331dc1fc03c4a381ebdd88f751a4d12de4ec97fa1faf18bb37721a4b5b",
  "vendor/pdf.worker.min.mjs": "52fadd5b81b6abd1eb665bab0c3749a8ad6a293fcb6ee9d9e0309f29d4f82619",
  "vendor/mammoth.browser.min.js": "5d4c0e7c9165d70b78f789c5274a2c7846d9e1c06ec19b69afa6ef45f789a3b9",
  "vendor/pdfjs.LICENSE": "0d542e0c8804e39aa7f37eb00da5a762149dc682d7829451287e11b938e94594",
  "vendor/mammoth.LICENSE": "6663bbd049205d38a496ccacb412a151980b444627d38de218b3b809aef330f1",
};
const expectedTrees = {
  "vendor/pdfjs/cmaps": [169, "f79f55e2765bb9656f9abeec040dc1989f24257396f9eef5b127e08117604ed3"],
  "vendor/pdfjs/standard_fonts": [16, "c74ee065f442fab1f3f1bf6481ab8f8bd51e2426cd8acb14a1701bf9cd096f8a"],
  "vendor/pdfjs/wasm": [13, "233214c8af1ce4cae7ba8e579d8e5cc5ea8fdc881838c6ee3cd6821a81d80811"],
};
function sha(data) { return crypto.createHash("sha256").update(data).digest("hex"); }
function treeDigest(rel) {
  const base = path.join(ROOT, rel), files = [];
  function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const item = path.join(dir, entry.name); entry.isDirectory() ? walk(item) : files.push(item); } }
  walk(base); files.sort(); const hash = crypto.createHash("sha256");
  for (const file of files) { hash.update(path.relative(base, file)); hash.update("\0"); hash.update(fs.readFileSync(file)); }
  return [files.length, hash.digest("hex")];
}
const failures = [];
for (const [rel, expected] of Object.entries(expectedFiles)) {
  const file = path.join(ROOT, rel); if (!fs.existsSync(file) || sha(fs.readFileSync(file)) !== expected) failures.push(rel);
}
for (const [rel, expected] of Object.entries(expectedTrees)) {
  const actual = treeDigest(rel); if (actual[0] !== expected[0] || actual[1] !== expected[1]) failures.push(rel);
}
if (failures.length) { console.error("Vendored dependency integrity failed: " + failures.join(", ")); process.exit(1); }
console.log("✅ vendored libraries, PDF resources, and licence files match recorded hashes");

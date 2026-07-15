/* Static privacy invariant checks. Apache-2.0 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const files = ["index.html", ...fs.readdirSync(path.join(ROOT, "js")).filter(f => /\.m?js$/.test(f)).map(f => "js/" + f)];
const forbidden = [
  [/\bfetch\s*\(/, "fetch"],
  [/\bXMLHttpRequest\b/, "XMLHttpRequest"],
  [/\bWebSocket\b/, "WebSocket"],
  [/\bsendBeacon\b/, "sendBeacon"],
  [/<(?:script|img|iframe|link)\b[^>]+(?:src|href)=["']https?:/i, "remote asset"],
];
const failures = [];
for (const rel of files) {
  const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
  for (const [pattern, label] of forbidden) if (pattern.test(text)) failures.push(rel + ": unexpected " + label);
}
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log("✅ first-party source contains no network API or remote asset reference");

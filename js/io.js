/* Annotate — save / load self-contained HTML. Apache-2.0 */
(function (global) {
  "use strict";
  const AN = global.AN;
  const io = AN.io = {};

  // Minimal CSS so the exported file renders correctly with no external assets.
  function staticCss() {
    return [
      'body{margin:0;background:#eceef1;font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1f2430}',
      '.export-bar{position:sticky;top:0;z-index:10;background:#1f2430;color:#fff;padding:9px 16px;display:flex;gap:10px;align-items:center;font-size:13px}',
      '.export-bar a{color:#9bc2ff;text-decoration:none}',
      '.export-doc{display:flex;flex-direction:column;align-items:center;gap:24px;padding:28px 16px 60px}',
      '.page{position:relative;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.06),0 4px 14px rgba(16,24,40,.12);transform:none!important}',
      '.page .bg{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block}',
      '.page .bg-html{position:absolute;inset:0;overflow:hidden;background:#fff}',
      '.page svg.vector{position:absolute;inset:0;width:100%;height:100%;overflow:visible}',
      '.page .html-layer{position:absolute;inset:0}',
      '.ann{position:absolute}',
      '.ann-text{padding:3px 5px;white-space:pre-wrap;word-break:break-word;line-height:1.3}',
      '.ann-note{padding:10px 11px;box-shadow:0 4px 12px rgba(16,24,40,.18);border-radius:3px 3px 3px 12px;overflow:hidden}',
      '.ann-note .note-body{white-space:pre-wrap;word-break:break-word;font-size:14px;line-height:1.35}',
      '.ann-comment{width:0;height:0}',
      '.ann-comment .pin{position:absolute;left:-2px;top:-30px;width:28px;height:30px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.3))}',
      '.ann-comment .bubble{position:absolute;left:24px;top:-30px;width:210px;background:#fff;border:1px solid #cdd2da;border-radius:8px;box-shadow:0 4px 14px rgba(16,24,40,.18);padding:8px 9px}',
      '.ann-comment .cmeta{font-size:11px;color:#6b7280;margin-top:4px}',
      '.handle{display:none!important}',
      AN.DOCX_CSS || "",
    ].join("\n");
  }

  // Build the static, viewable document body from the *live* rendered DOM,
  // normalised to zoom = 1 and stripped of editor-only chrome.
  function buildStaticDoc() {
    const src = document.getElementById("pages");
    const clone = src.cloneNode(true);
    clone.removeAttribute("hidden");
    clone.querySelectorAll(".ui-layer").forEach(n => n.remove());
    clone.querySelectorAll(".handle").forEach(n => n.remove());
    clone.querySelectorAll("[contenteditable]").forEach(n => n.removeAttribute("contenteditable"));
    clone.querySelectorAll(".page-slot").forEach(slot => {
      const page = slot.querySelector(".page");
      if (page) { page.style.transform = "none"; slot.style.width = page.style.width; slot.style.height = page.style.height; }
    });
    // show all comment bubbles so the reader can see them
    clone.querySelectorAll(".ann-comment").forEach(c => c.classList.add("open"));
    // strip the page-slot wrapper; emit bare .page nodes
    const out = document.createElement("div");
    clone.querySelectorAll(".page-slot .page").forEach(p => out.appendChild(p));
    return out.innerHTML;
  }

  function esc(s) { return String(s).replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c])); }

  io.buildHtml = function () {
    const state = JSON.stringify(AN.serialize());
    const safeState = state.replace(/</g, "\\u003c").replace(/-->/g, "--\\u003e");
    const title = esc(AN.state.title || "Annotated document");
    const body = buildStaticDoc();
    return [
      "<!DOCTYPE html>",
      '<html lang="en"><head><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<meta name="generator" content="Annotate — https://github.com (Apache-2.0)">',
      "<title>" + title + "</title>",
      "<style>" + staticCss() + "</style></head>",
      '<body>',
      '<div class="export-bar">📝 Annotated with <strong>&nbsp;Annotate</strong>&nbsp;— a privacy-first, fully-local tool. Open this file in the Annotate editor to keep editing.</div>',
      '<div class="export-doc">' + body + "</div>",
      '<script type="application/json" id="annotate-state">' + safeState + "<\/script>",
      "</body></html>",
    ].join("\n");
  };

  io.save = function () {
    if (!AN.state.pages.length) { AN.toast("Nothing to save yet — open a document first."); return; }
    const html = io.buildHtml();
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (AN.state.title || "annotated").replace(/[^\w.-]+/g, "_") + ".annotated.html";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    AN.toast("Saved " + a.download);
  };

  io.loadFromText = function (text) {
    let doc;
    try { doc = new DOMParser().parseFromString(text, "text/html"); }
    catch (e) { AN.toast("Couldn't read that file."); return false; }
    const node = doc.getElementById("annotate-state");
    if (!node) { AN.toast("That HTML isn't an Annotate project (no embedded data)."); return false; }
    let data;
    try { data = JSON.parse(node.textContent); }
    catch (e) { AN.toast("The project data is corrupted."); return false; }
    if (!AN.loadSerialized(data)) { AN.toast("Couldn't load that project."); return false; }
    AN.emit("rerender");
    AN.scheduleAutosave();
    AN.toast("Project loaded.");
    return true;
  };

  io.loadFile = function (file) {
    const fr = new FileReader();
    fr.onload = () => io.loadFromText(fr.result);
    fr.onerror = () => AN.toast("Couldn't read that file.");
    fr.readAsText(file);
  };

})(window);

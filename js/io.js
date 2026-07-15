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
      '.pdf-text-layer{position:absolute;inset:0;overflow:hidden;pointer-events:none;user-select:text}',
      '.pdf-text-layer span{position:absolute;display:block;color:transparent;white-space:pre;line-height:1;transform-origin:0 0;pointer-events:auto;cursor:text}',
      '.pdf-text-layer span::selection{background:rgba(47,111,237,.3);color:transparent}',
      '.page svg.vector{position:absolute;inset:0;width:100%;height:100%;overflow:visible}',
      '.page .html-layer{position:absolute;inset:0}',
      '.ann{position:absolute}',
      '.ann-text{padding:3px 5px;white-space:pre-wrap;word-break:break-word;line-height:1.3}',
      '.ann-note{padding:10px 11px;box-shadow:0 4px 12px rgba(16,24,40,.18);border-radius:3px 3px 3px 12px;overflow:hidden}',
      '.ann-note .note-body{white-space:pre-wrap;word-break:break-word;font-size:14px;line-height:1.35}',
      '.comment-anchor-layer{position:absolute;inset:0;pointer-events:none}',
      '.comment-anchor{position:absolute;transform:translate(-50%,-50%);width:24px;height:24px;border:2px solid #fff;border-radius:50%;color:#fff;font-weight:700}',
      '.comment-rail{position:absolute;left:calc(100% + 18px);top:0;width:224px;height:100%}',
      '.ann-comment{left:0;width:202px;min-height:62px;background:#fff;border:1px solid #cdd2da;border-left:4px solid #2f6fed;border-radius:6px;box-shadow:0 4px 14px rgba(16,24,40,.18);padding:9px}',
      '.ann-comment .cbody{white-space:pre-wrap;word-break:break-word;min-height:34px;font-size:13px}',
      '.ann-comment .cmeta{display:flex;align-items:center;gap:6px;font-size:11px;color:#6b7280;margin-bottom:5px}',
      '.comment-number{display:inline-grid;place-items:center;width:19px;height:19px;border-radius:50%;color:#fff;font-weight:700}',
      '.comment-appendix{width:760px;max-width:100%;box-sizing:border-box;margin:24px auto;padding:24px;background:#fff}',
      '.comment-appendix .ann-comment{position:relative;top:auto!important;left:auto;width:auto;margin:0 0 10px}',
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
    clone.querySelectorAll("button.comment-anchor").forEach(button => {
      const span = document.createElement("span"); span.className = button.className; span.textContent = button.textContent;
      span.setAttribute("style", button.getAttribute("style") || ""); span.setAttribute("aria-hidden", "true"); button.replaceWith(span);
    });
    clone.querySelectorAll(".ann-comment[tabindex]").forEach(card => card.removeAttribute("tabindex"));
    clone.querySelectorAll(".page-slot").forEach(slot => {
      const page = slot.querySelector(".page");
      if (page) { page.style.transform = "none"; slot.style.width = page.style.width; slot.style.height = page.style.height; }
    });
    // Lazy editor pages may not currently have a decoded image. Export always
    // materialises every background from canonical state.
    clone.querySelectorAll(".page").forEach(page => {
      const pg = AN.state.pages.find(item => item.id === page.dataset.page);
      const img = page.querySelector("img.bg");
      if (pg && img && pg.bg) img.setAttribute("src", pg.bg);
    });
    // strip the page-slot wrapper; emit bare .page nodes
    const out = document.createElement("div");
    clone.querySelectorAll(".page-slot").forEach(slot => {
      const page = slot.querySelector(".page"); if (page) out.appendChild(page);
      const appendix = clone.querySelector('.comment-appendix[data-page="' + page.dataset.page + '"]');
      if (appendix && appendix.classList.contains("comment-appendix") && appendix.classList.contains("active")) out.appendChild(appendix);
    });
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
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'">',
      '<meta name="generator" content="Annotate — https://github.com/lfurze/annotate (Apache-2.0)">',
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
    AN.markClean();
    AN.toast("Saved " + a.download);
  };

  io.print = async function () {
    if (!AN.state.pages.length) { AN.toast("Nothing to print yet — open a document first."); return false; }
    if (AN.editor) AN.editor.deselect();
    const images = AN.editor ? AN.editor.loadAllBackgrounds() : Array.from(document.querySelectorAll("#pages img.bg"));
    try {
      await Promise.all(images.map(imageReady));
    } catch (error) {
      AN.toast(error.message || "A page image could not be prepared for printing.");
      return false;
    }
    // Give style/layout and decoded raster pixels a frame to reach the print
    // compositor. This is especially important for off-screen PDF pages.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    global.print();
    return true;
  };

  function imageReady(image) {
    if (image.complete && image.naturalWidth) return image.decode ? image.decode().catch(() => {}) : Promise.resolve();
    return new Promise((resolve, reject) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", () => reject(new Error("A page image could not be rendered.")), { once: true });
    });
  }

  io.renderPagePng = async function (pageIndex) {
    const pg = AN.state.pages[pageIndex];
    if (!pg) throw new Error("There is no page to export.");
    if (pg.kind !== "image" || !pg.bg) throw new Error("PNG export currently supports PDF and image pages. Use Print / PDF for DOCX pages.");
    if (pg.w * pg.h > 16000000) throw new Error("This page is too large to export safely.");
    if (AN.editor) AN.editor.deselect();
    const scale = Math.min(2, Math.sqrt(16000000 / (pg.w * pg.h)));
    const width = Math.max(1, Math.round(pg.w * scale)), height = Math.max(1, Math.round(pg.h * scale));
    const image = new Image(); image.src = pg.bg; await imageReady(image);
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, width, height); ctx.scale(scale, scale); ctx.drawImage(image, 0, 0, pg.w, pg.h);
    AN.annsForPage(pg.id).forEach(annotation => drawPngAnnotation(ctx, annotation));
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    canvas.width = canvas.height = 0;
    if (!blob) throw new Error("The browser could not create a PNG.");
    return blob;
  };

  function strokeSetup(ctx, annotation) {
    ctx.strokeStyle = annotation.color; ctx.lineWidth = annotation.width; ctx.lineCap = "round"; ctx.lineJoin = "round";
  }
  function drawPngAnnotation(ctx, a) {
    ctx.save();
    if (a.type === "pen" || a.type === "highlight") {
      strokeSetup(ctx, a); if (a.type === "highlight") { ctx.globalAlpha = 0.4; ctx.globalCompositeOperation = "multiply"; }
      ctx.beginPath(); (a.points || []).forEach((point, index) => index ? ctx.lineTo(point[0], point[1]) : ctx.moveTo(point[0], point[1])); ctx.stroke();
    } else if (a.type === "rect" || a.type === "ellipse") {
      strokeSetup(ctx, a); ctx.beginPath();
      if (a.type === "rect") ctx.rect(Math.min(a.x, a.x + a.w), Math.min(a.y, a.y + a.h), Math.abs(a.w), Math.abs(a.h));
      else ctx.ellipse(a.x + a.w / 2, a.y + a.h / 2, Math.abs(a.w / 2), Math.abs(a.h / 2), 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (a.type === "line" || a.type === "arrow") {
      strokeSetup(ctx, a); const angle = Math.atan2(a.y2 - a.y1, a.x2 - a.x1), head = Math.max(8, a.width * 3.2);
      const endX = a.type === "arrow" ? a.x2 - head * 0.9 * Math.cos(angle) : a.x2;
      const endY = a.type === "arrow" ? a.y2 - head * 0.9 * Math.sin(angle) : a.y2;
      ctx.beginPath(); ctx.moveTo(a.x1, a.y1); ctx.lineTo(endX, endY); ctx.stroke();
      if (a.type === "arrow") { ctx.fillStyle = a.color; ctx.beginPath(); ctx.moveTo(a.x2, a.y2); ctx.lineTo(a.x2 - head * Math.cos(angle - Math.PI / 7), a.y2 - head * Math.sin(angle - Math.PI / 7)); ctx.lineTo(a.x2 - head * Math.cos(angle + Math.PI / 7), a.y2 - head * Math.sin(angle + Math.PI / 7)); ctx.closePath(); ctx.fill(); }
    } else if (a.type === "text") {
      ctx.fillStyle = a.color; ctx.font = (a.italic ? "italic " : "") + (a.bold ? "700 " : "400 ") + a.fontSize + "px " + a.fontFamily;
      drawWrappedText(ctx, a.text, a.x + 3, a.y + a.fontSize + 3, a.w || 400, a.fontSize * 1.3);
    } else if (a.type === "note") {
      ctx.fillStyle = a.color; ctx.fillRect(a.x, a.y, a.w || 200, a.h || 120); ctx.fillStyle = "#1f2430"; ctx.font = "14px system-ui, sans-serif";
      drawWrappedText(ctx, a.text, a.x + 11, a.y + 25, (a.w || 200) - 22, 19);
    } else if (a.type === "comment") {
      ctx.fillStyle = a.color; ctx.beginPath(); ctx.arc(a.x + 12, a.y - 18, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(a.x + 12, a.y - 18, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.fillRect(a.x + 24, a.y - 30, 210, 70); ctx.strokeStyle = "#cdd2da"; ctx.lineWidth = 1; ctx.strokeRect(a.x + 24, a.y - 30, 210, 70);
      ctx.fillStyle = "#1f2430"; ctx.font = "14px system-ui, sans-serif"; drawWrappedText(ctx, a.text, a.x + 33, a.y - 10, 192, 18);
    }
    ctx.restore();
  }
  function drawWrappedText(ctx, value, x, y, maxWidth, lineHeight) {
    const paragraphs = String(value || "").split(/\n/); let lineY = y;
    paragraphs.forEach(paragraph => {
      let line = "";
      paragraph.split(/\s+/).forEach(word => {
        const candidate = line ? line + " " + word : word;
        if (line && ctx.measureText(candidate).width > maxWidth) { ctx.fillText(line, x, lineY); lineY += lineHeight; line = word; }
        else line = candidate;
      });
      if (line) ctx.fillText(line, x, lineY); lineY += lineHeight;
    });
  }

  io.savePng = async function (pageIndex) {
    if (!AN.state.pages.length) { AN.toast("Nothing to export yet — open a document first."); return false; }
    try {
      const blob = await io.renderPagePng(pageIndex == null ? 0 : pageIndex);
      const url = URL.createObjectURL(blob), a = document.createElement("a");
      const base = (AN.state.title || "annotated").replace(/[^\w.-]+/g, "_");
      a.href = url; a.download = base + "-page-" + ((pageIndex || 0) + 1) + ".png";
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
      AN.toast("Exported " + a.download); return true;
    } catch (error) { AN.toast(error.message || "Couldn't export this page."); return false; }
  };

  io.loadFromText = function (text) {
    if (typeof text !== "string" || text.length > 150000000) { AN.toast("That project is too large to load safely."); return false; }
    let doc;
    try { doc = new DOMParser().parseFromString(text, "text/html"); }
    catch (e) { AN.toast("Couldn't read that file."); return false; }
    const node = doc.getElementById("annotate-state");
    if (!node) { AN.toast("That HTML isn't an Annotate project (no embedded data)."); return false; }
    let data;
    try { data = JSON.parse(node.textContent); }
    catch (e) { AN.toast("The project data is corrupted."); return false; }
    if (!AN.loadSerialized(data, { clean: true })) { AN.toast((AN.lastLoadError && AN.lastLoadError.message) || "Couldn't load that project."); return false; }
    AN.emit("rerender");
    AN.scheduleAutosave();
    AN.toast("Project loaded.");
    return true;
  };

  io.loadFile = function (file) {
    if (!AN.confirmDiscard()) return false;
    const fr = new FileReader();
    fr.onload = () => io.loadFromText(fr.result);
    fr.onerror = () => AN.toast("Couldn't read that file.");
    fr.readAsText(file);
    return true;
  };

})(window);

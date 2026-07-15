/* Annotate — page thumbnails and organization. Apache-2.0 */
(function (global) {
  "use strict";
  const AN = global.AN;
  let aside, list, summary, toggle;

  function init() {
    aside = document.getElementById("page-sidebar"); list = document.getElementById("page-list");
    summary = document.getElementById("page-summary"); toggle = document.getElementById("btn-pages");
    toggle.addEventListener("click", () => setOpen(aside.hidden));
    document.getElementById("btn-close-pages").addEventListener("click", () => setOpen(false));
    AN.on("rerender", render); AN.on("change", render); render();
  }
  function setOpen(open) {
    aside.hidden = !open; toggle.setAttribute("aria-expanded", String(open));
    if (open) { closeAnnotationSidebar(); render(); (list.querySelector(".page-thumb-main") || document.getElementById("btn-close-pages")).focus(); }
    else responsiveTrigger(toggle).focus();
  }
  function responsiveTrigger(fallback) { const more = document.getElementById("btn-mobile-actions"); return more && !more.hidden ? more : fallback; }
  function closeAnnotationSidebar() {
    const other = document.getElementById("annotation-sidebar"), button = document.getElementById("btn-annotations");
    if (other && !other.hidden) { other.hidden = true; button.setAttribute("aria-expanded", "false"); }
  }
  function render() {
    if (!list) return; list.textContent = "";
    summary.textContent = AN.state.pages.length + (AN.state.pages.length === 1 ? " page" : " pages");
    AN.state.pages.forEach((page, index) => list.appendChild(pageRow(page, index)));
  }
  function pageRow(page, index) {
    const row = document.createElement("div"); row.className = "page-thumb-row"; row.dataset.id = page.id;
    const main = document.createElement("button"); main.type = "button"; main.className = "page-thumb-main";
    main.setAttribute("aria-label", "Go to page " + (index + 1)); main.addEventListener("click", () => AN.goToPage(index));
    if (page.thumb) { const img = document.createElement("img"); img.src = page.thumb; img.alt = ""; main.appendChild(img); }
    else { const preview = document.createElement("span"); preview.className = "page-html-preview"; preview.textContent = page.kind === "html" ? stripHtml(page.html).slice(0, 90) : "Page preview"; main.appendChild(preview); }
    const number = document.createElement("span"); number.className = "page-thumb-number"; number.textContent = "Page " + (index + 1); main.appendChild(number);
    const actions = document.createElement("div"); actions.className = "page-thumb-actions";
    actions.appendChild(actionButton("↑", "Move page " + (index + 1) + " up", index === 0, () => move(index, index - 1)));
    actions.appendChild(actionButton("↓", "Move page " + (index + 1) + " down", index === AN.state.pages.length - 1, () => move(index, index + 1)));
    const rotationBlocked = page.kind !== "image" || AN.annsForPage(page.id).length > 0;
    actions.appendChild(actionButton("↺", "Rotate page " + (index + 1) + " left", rotationBlocked, () => rotate(page, false)));
    actions.appendChild(actionButton("↻", "Rotate page " + (index + 1) + " right", rotationBlocked, () => rotate(page, true)));
    actions.appendChild(actionButton("×", "Delete page " + (index + 1), AN.state.pages.length <= 1, () => remove(page, index)));
    row.appendChild(main); row.appendChild(actions); return row;
  }
  function actionButton(text, label, disabled, fn) {
    const button = document.createElement("button"); button.type = "button"; button.className = "page-mini";
    button.textContent = text; button.setAttribute("aria-label", label); button.disabled = disabled; button.addEventListener("click", fn); return button;
  }
  function move(from, to) { if (AN.movePage(from, to)) requestAnimationFrame(() => { render(); const buttons = list.querySelectorAll(".page-thumb-main"); if (buttons[to]) buttons[to].focus(); }); }
  async function rotate(page, clockwise) {
    if (page.kind !== "image" || AN.annsForPage(page.id).length) return;
    const controls = list.querySelectorAll("button"); controls.forEach(button => button.disabled = true);
    try {
      const image = await loadImage(page.bg), oldW = page.w, oldH = page.h;
      const canvas = document.createElement("canvas"); canvas.width = oldH; canvas.height = oldW;
      const ctx = canvas.getContext("2d", { alpha: false }); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (clockwise) { ctx.translate(oldH, 0); ctx.rotate(Math.PI / 2); }
      else { ctx.translate(0, oldW); ctx.rotate(-Math.PI / 2); }
      ctx.drawImage(image, 0, 0, oldW, oldH);
      page.bg = canvas.toDataURL("image/jpeg", 0.85); page.thumb = makeThumbnail(canvas); page.w = oldH; page.h = oldW;
      page.pdfText = (page.pdfText || []).map(item => rotateText(item, oldW, oldH, clockwise));
      canvas.width = canvas.height = 0;
      AN.resetHistory(); AN.markDirty(); AN.emit("rerender"); AN.emit("change"); AN.scheduleAutosave();
      AN.toast("Page rotated.");
    } catch (_) { AN.toast("Couldn't rotate that page."); render(); }
  }
  function rotateText(item, oldW, oldH, clockwise) {
    return clockwise
      ? { ...item, x: oldH - item.y, y: item.x, angle: normalizeAngle((item.angle || 0) + 90) }
      : { ...item, x: item.y, y: oldW - item.x, angle: normalizeAngle((item.angle || 0) - 90) };
  }
  function normalizeAngle(angle) { while (angle > 180) angle -= 360; while (angle < -180) angle += 360; return angle; }
  function loadImage(src) { return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; }); }
  function makeThumbnail(source) {
    const scale = Math.min(120 / source.width, 160 / source.height, 1), canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(source.width * scale)); canvas.height = Math.max(1, Math.round(source.height * scale));
    const ctx = canvas.getContext("2d", { alpha: false }); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/jpeg", 0.6); canvas.width = canvas.height = 0; return data;
  }
  function remove(page, index) {
    const count = AN.annsForPage(page.id).length;
    const detail = count ? " This also deletes " + count + (count === 1 ? " annotation." : " annotations.") : "";
    if (!global.confirm("Delete page " + (index + 1) + "?" + detail)) return;
    if (AN.deletePage(page.id)) requestAnimationFrame(() => { render(); const next = list.querySelectorAll(".page-thumb-main")[Math.min(index, AN.state.pages.length - 1)]; if (next) next.focus(); });
  }
  function stripHtml(html) { const div = document.createElement("div"); div.innerHTML = AN.security.sanitizeDocumentHtml(html || ""); return div.textContent.trim().replace(/\s+/g, " "); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})(window);

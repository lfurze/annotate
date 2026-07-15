/* Annotate — UI wiring & init. Apache-2.0 */
(function (global) {
  "use strict";
  const AN = global.AN, ed = AN.editor, io = AN.io, S = AN.settings;
  const $ = (id) => document.getElementById(id);
  let currentPage = 0;

  AN.confirmDiscard = function () {
    return !AN.isDirty() || global.confirm("Discard unsaved changes and open another document?");
  };

  // ---- toast ---------------------------------------------------------------
  let toastTimer;
  AN.toast = function (msg) {
    const t = $("toast"); t.textContent = msg; t.hidden = false;
    requestAnimationFrame(() => t.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.hidden = true, 250); }, 2600);
  };

  // ---- tool selection ------------------------------------------------------
  AN.setTool = function (tool) {
    S.tool = tool;
    document.body.dataset.tool = tool;
    document.body.classList.toggle("mode-select", tool === "select");
    document.body.classList.toggle("mode-draw", tool !== "select");
    document.querySelectorAll(".tool").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.tool === tool)));
    if (tool !== "select") ed.deselect();
    updatePropbar();
  };

  // ---- zoom ----------------------------------------------------------------
  function setZoom(z) {
    S.zoom = Math.max(0.25, Math.min(4, Math.round(z * 100) / 100));
    $("zoom-label").textContent = Math.round(S.zoom * 100) + "%";
    AN.emit("zoom");
  }
  AN.setZoom = setZoom;

  function updatePageNav(index) {
    const count = AN.state.pages.length;
    currentPage = Math.max(0, Math.min(count - 1, index || 0));
    $("page-nav").hidden = count < 2;
    $("page-label").textContent = count ? (currentPage + 1) + " / " + count : "0 / 0";
    $("btn-page-prev").disabled = currentPage <= 0;
    $("btn-page-next").disabled = currentPage >= count - 1;
  }
  function goToPage(index) {
    const slots = Array.from(document.querySelectorAll("#pages .page-slot"));
    if (!slots.length) return;
    const next = Math.max(0, Math.min(slots.length - 1, index));
    // Page controls are discrete navigation, so jump atomically. Smooth scrolling
    // emits intermediate positions that can temporarily select the wrong page.
    slots[next].scrollIntoView({ behavior: "auto", block: "start" });
    updatePageNav(next);
  }
  AN.goToPage = goToPage;
  AN.currentPageIndex = function () { return currentPage; };
  function syncPageFromScroll() {
    const vp = $("viewport"), slots = Array.from(document.querySelectorAll("#pages .page-slot"));
    if (slots.length < 2) return;
    const top = vp.getBoundingClientRect().top + 20;
    let best = 0, distance = Infinity;
    slots.forEach((slot, i) => { const d = Math.abs(slot.getBoundingClientRect().top - top); if (d < distance) { distance = d; best = i; } });
    if (best !== currentPage) updatePageNav(best);
  }

  // ---- property bar --------------------------------------------------------
  const COLOR_GROUP = $("color-swatches"), HL_GROUP = $("hl-swatches");

  function buildSwatches() {
    AN.PEN_COLORS.forEach(c => COLOR_GROUP.appendChild(swatch(c, () => onColorPick(c))));
    AN.HL_COLORS.forEach(c => HL_GROUP.appendChild(swatch(c, () => onHlPick(c))));
  }
  function swatch(color, fn) {
    const b = document.createElement("button");
    b.className = "swatch"; b.style.background = color; b.dataset.color = color.toLowerCase();
    b.title = color; b.setAttribute("aria-label", "Use colour " + color); b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", fn);
    return b;
  }

  function sel() { const id = ed.selectedId(); return id ? AN.getAnn(id) : null; }

  // what do the colour controls currently target?
  function colorTargetIsHl() {
    const a = sel();
    if (a) return a.type === "highlight" || a.type === "note";
    return S.tool === "highlight" || S.tool === "note";
  }

  function onColorPick(c, continuous) {
    const a = sel();
    if (a && ["pen", "rect", "ellipse", "line", "arrow", "text", "comment"].includes(a.type)) ed.applyStyleToSelection({ color: c }, { continuous: !!continuous });
    else S.color = c;
    $("color-custom").value = toHex(c);
    refreshSwatchActive();
  }
  function onHlPick(c) {
    const a = sel();
    if (a && (a.type === "highlight" || a.type === "note")) ed.applyStyleToSelection({ color: c });
    else if (S.tool === "note") S.hlColor = c;
    else S.hlColor = c;
    refreshSwatchActive();
  }

  function refreshSwatchActive() {
    const a = sel();
    const curColor = a ? (a.color || "").toLowerCase() : (colorTargetIsHl() ? S.hlColor : S.color).toLowerCase();
    COLOR_GROUP.querySelectorAll(".swatch").forEach(s => { const on = s.dataset.color === curColor; s.classList.toggle("active", on); s.setAttribute("aria-pressed", String(on)); });
    HL_GROUP.querySelectorAll(".swatch").forEach(s => { const on = s.dataset.color === curColor; s.classList.toggle("active", on); s.setAttribute("aria-pressed", String(on)); });
  }

  function updatePropbar() {
    const bar = $("propbar");
    const a = sel();
    const t = S.tool;
    const groups = {};
    const show = (name, on) => { const g = bar.querySelector('.prop-group[data-for="' + name + '"]'); if (g) g.hidden = !on; groups[name] = on; };

    const isShapeTool = ["pen", "rect", "ellipse", "line", "arrow"].includes(t);
    const isShapeSel = a && ["pen", "rect", "ellipse", "line", "arrow"].includes(a.type);
    const colorRelevant = a ? ["pen", "rect", "ellipse", "line", "arrow", "text", "comment"].includes(a.type)
                            : ["pen", "rect", "ellipse", "line", "arrow", "text", "comment"].includes(t);
    const hlRelevant = a ? (a.type === "highlight" || a.type === "note") : (t === "highlight" || t === "note");
    const widthRelevant = a ? ["pen", "highlight", "rect", "ellipse", "line", "arrow"].includes(a.type)
                            : ["pen", "highlight", "rect", "ellipse", "line", "arrow"].includes(t);
    const fontRelevant = a ? a.type === "text" : t === "text";

    show("color", colorRelevant);
    show("hl", hlRelevant);
    show("width", widthRelevant);
    show("font", fontRelevant);
    show("selection", !!a);

    const anyVisible = colorRelevant || hlRelevant || widthRelevant || fontRelevant || !!a;
    bar.hidden = !anyVisible || !AN.state.pages.length;

    // sync control values
    if (widthRelevant) {
      const w = a ? a.width : (t === "highlight" ? S.hlWidth : S.width);
      $("stroke-width").value = w; $("stroke-width-val").textContent = w;
    }
    if (fontRelevant) {
      const fs = a ? a.fontSize : S.fontSize;
      $("font-size").value = String(fs);
      $("font-family").value = a ? a.fontFamily : S.fontFamily;
      $("font-bold").classList.toggle("active", a ? !!a.bold : S.bold);
      $("font-italic").classList.toggle("active", a ? !!a.italic : S.italic);
      $("font-bold").setAttribute("aria-pressed", String(a ? !!a.bold : S.bold));
      $("font-italic").setAttribute("aria-pressed", String(a ? !!a.italic : S.italic));
    }
    refreshSwatchActive();
  }

  AN.on("selection", () => updatePropbar());

  // ---- file open / load ----------------------------------------------------
  async function openFile(file) {
    if (!file) return;
    if (!AN.confirmDiscard()) return;
    const token = { cancelled: false };
    showLoading(true, token);
    try {
      await AN.importFile(file, (n, total) => setLoading("Rendering page " + n + " of " + total + "…"), () => token.cancelled);
      AN.setTool("select");
      AN.toast("Opened " + file.name);
    } catch (e) {
      if (e.name === "AbortError") AN.toast("Import cancelled.");
      else { console.error(e); AN.toast(e.message || "Couldn't open that file."); }
    } finally { showLoading(false); }
  }

  let loadingEl;
  function showLoading(on, token) {
    if (on) {
      if (!loadingEl) {
        loadingEl = document.createElement("div"); loadingEl.className = "page-loading"; loadingEl.setAttribute("role", "status"); loadingEl.setAttribute("aria-live", "polite");
        loadingEl.innerHTML = '<span class="spinner" aria-hidden="true"></span><span class="ltext">Loading…</span><button type="button" class="tbtn small cancel-import">Cancel</button>';
      }
      const cancel = loadingEl.querySelector(".cancel-import");
      cancel.onclick = () => { if (token) token.cancelled = true; cancel.disabled = true; setLoading("Cancelling…"); };
      cancel.disabled = false;
      const pages = $("pages"); pages.hidden = false; pages.innerHTML = ""; pages.appendChild(loadingEl);
      $("welcome").style.display = "none";
    } else if (loadingEl && loadingEl.parentNode) { AN.emit("rerender"); }
  }
  function setLoading(msg) { if (loadingEl) { const t = loadingEl.querySelector(".ltext"); if (t) t.textContent = msg; } }

  // ---- wiring --------------------------------------------------------------
  function wire() {
    // tools
    document.querySelectorAll(".tool").forEach(b => b.addEventListener("click", () => AN.setTool(b.dataset.tool)));
    // file ops
    $("btn-open").addEventListener("click", () => $("file-open").click());
    $("btn-load").addEventListener("click", () => $("file-load").click());
    $("btn-save").addEventListener("click", () => io.save());
    $("btn-print").addEventListener("click", () => io.print());
    $("btn-png").addEventListener("click", async () => {
      const button = $("btn-png"); button.disabled = true; button.setAttribute("aria-busy", "true");
      try { await io.savePng(currentPage); }
      finally { button.disabled = false; button.removeAttribute("aria-busy"); }
    });
    $("welcome-open").addEventListener("click", () => $("file-open").click());
    $("welcome-load").addEventListener("click", () => $("file-load").click());
    $("file-open").addEventListener("change", (e) => { openFile(e.target.files[0]); e.target.value = ""; });
    $("file-load").addEventListener("change", (e) => { const f = e.target.files[0]; if (f) io.loadFile(f); e.target.value = ""; });
    // undo / redo
    $("btn-undo").addEventListener("click", () => AN.undo());
    $("btn-redo").addEventListener("click", () => AN.redo());
    AN.on("history", (s) => { $("btn-undo").disabled = !s.canUndo; $("btn-redo").disabled = !s.canRedo; });
    AN.on("dirty", (isDirty) => {
      $("btn-save").classList.toggle("has-changes", isDirty);
      $("btn-save").setAttribute("aria-label", isDirty ? "Save project; unsaved changes" : "Save project");
    });
    AN.on("autosave", updateAutosaveStatus);
    // zoom
    $("btn-zoom-in").addEventListener("click", () => setZoom(S.zoom + 0.1));
    $("btn-zoom-out").addEventListener("click", () => setZoom(S.zoom - 0.1));
    $("zoom-label").addEventListener("click", () => setZoom(1));
    $("btn-page-prev").addEventListener("click", () => goToPage(currentPage - 1));
    $("btn-page-next").addEventListener("click", () => goToPage(currentPage + 1));
    $("viewport").addEventListener("scroll", syncPageFromScroll, { passive: true });
    AN.on("rerender", () => requestAnimationFrame(() => updatePageNav(0)));
    // help
    $("btn-help").addEventListener("click", () => $("help-dialog").showModal());
    // delete
    $("btn-delete").addEventListener("click", () => ed.deleteSelected());
    // property controls
    let continuousStyle = false;
    const beginContinuousStyle = () => { if (!continuousStyle && sel()) { AN.beginChange(); continuousStyle = true; } };
    const endContinuousStyle = () => { if (continuousStyle) { continuousStyle = false; AN.endChange(); } };
    $("color-custom").addEventListener("pointerdown", beginContinuousStyle);
    $("color-custom").addEventListener("input", (e) => onColorPick(e.target.value, continuousStyle));
    $("color-custom").addEventListener("change", endContinuousStyle);
    $("color-custom").addEventListener("blur", endContinuousStyle);
    $("stroke-width").addEventListener("pointerdown", beginContinuousStyle);
    $("stroke-width").addEventListener("input", (e) => {
      const v = +e.target.value; $("stroke-width-val").textContent = v;
      const a = sel();
      if (a && ["pen", "highlight", "rect", "ellipse", "line", "arrow"].includes(a.type)) ed.applyStyleToSelection({ width: v }, { continuous: continuousStyle });
      else if (S.tool === "highlight") S.hlWidth = v; else S.width = v;
    });
    $("stroke-width").addEventListener("change", endContinuousStyle);
    $("stroke-width").addEventListener("blur", endContinuousStyle);
    $("font-size").addEventListener("change", (e) => { const v = +e.target.value; const a = sel(); if (a && a.type === "text") ed.applyStyleToSelection({ fontSize: v }); else S.fontSize = v; });
    $("font-family").addEventListener("change", (e) => { const v = e.target.value; const a = sel(); if (a && a.type === "text") ed.applyStyleToSelection({ fontFamily: v }); else S.fontFamily = v; });
    $("font-bold").addEventListener("click", () => { const a = sel(); if (a && a.type === "text") { ed.applyStyleToSelection({ bold: !a.bold }); } else S.bold = !S.bold; updatePropbar(); });
    $("font-italic").addEventListener("click", () => { const a = sel(); if (a && a.type === "text") { ed.applyStyleToSelection({ italic: !a.italic }); } else S.italic = !S.italic; updatePropbar(); });

    // keyboard
    document.addEventListener("keydown", onKey);

    // drag & drop
    let dragDepth = 0;
    window.addEventListener("dragover", (e) => { e.preventDefault(); });
    window.addEventListener("dragenter", (e) => { e.preventDefault(); dragDepth++; $("drop-overlay").hidden = false; });
    window.addEventListener("dragleave", (e) => { dragDepth--; if (dragDepth <= 0) { dragDepth = 0; $("drop-overlay").hidden = true; } });
    window.addEventListener("drop", (e) => {
      e.preventDefault(); dragDepth = 0; $("drop-overlay").hidden = true;
      const f = e.dataTransfer.files[0]; if (!f) return;
      if (/\.html?$/i.test(f.name)) io.loadFile(f); else openFile(f);
    });

    // restore banner
    $("restore-yes").addEventListener("click", restoreSession);
    $("restore-no").addEventListener("click", () => { AN.clearAutosave(); $("restore-banner").hidden = true; });
  }

  function setupResponsiveActions() {
    const toggle = $("btn-mobile-actions"), panel = $("mobile-actions");
    const ids = ["btn-print", "btn-png", "btn-annotations", "btn-pages", "btn-projects", "btn-undo", "btn-redo", "page-nav", "autosave-status", "btn-zoom-out", "zoom-label", "btn-zoom-in", "btn-help"];
    const records = ids.map(id => ({ node: $(id), parent: $(id).parentNode }));
    const query = global.matchMedia("(max-width: 860px)");
    function close() { panel.hidden = true; toggle.setAttribute("aria-expanded", "false"); }
    function adapt() {
      close(); toggle.hidden = !query.matches;
      if (query.matches) records.forEach(record => panel.appendChild(record.node));
      else records.forEach(record => record.parent.appendChild(record.node));
    }
    toggle.addEventListener("click", () => { const open = panel.hidden; panel.hidden = !open; toggle.setAttribute("aria-expanded", String(open)); if (open) (panel.querySelector("button:not([disabled])") || panel).focus(); });
    panel.addEventListener("click", event => { if (event.target.closest("button") && !event.target.closest(".page-nav")) close(); });
    query.addEventListener ? query.addEventListener("change", adapt) : query.addListener(adapt);
    AN.closeResponsiveActions = close; adapt();
  }

  function onKey(e) {
    const tag = (e.target.tagName || "").toLowerCase();
    const editing = e.target.isContentEditable || tag === "input" || tag === "select" || tag === "textarea";
    const mod = e.metaKey || e.ctrlKey;

    if (mod && (e.key === "s" || e.key === "S")) { e.preventDefault(); io.save(); return; }
    if (mod && (e.key === "z" || e.key === "Z")) { e.preventDefault(); e.shiftKey ? AN.redo() : AN.undo(); return; }
    if (mod && (e.key === "y" || e.key === "Y")) { e.preventDefault(); AN.redo(); return; }

    if (e.key === "Escape") {
      if (editing && document.activeElement && document.activeElement.blur) { document.activeElement.blur(); return; }
      if ($("mobile-actions") && !$("mobile-actions").hidden) { AN.closeResponsiveActions(); $("btn-mobile-actions").focus(); return; }
      const annotations = $("annotation-sidebar"), pages = $("page-sidebar");
      if (annotations && !annotations.hidden) { $("btn-close-annotations").click(); return; }
      if (pages && !pages.hidden) { $("btn-close-pages").click(); return; }
      ed.deselect(); AN.setTool("select"); return;
    }
    if (editing) return;
    if (e.key === "Delete" || e.key === "Backspace") { if (ed.selectedId()) { e.preventDefault(); ed.deleteSelected(); } return; }
    if (e.key === "+" || e.key === "=") { setZoom(S.zoom + 0.1); return; }
    if (e.key === "-" || e.key === "_") { setZoom(S.zoom - 0.1); return; }
    if (e.key === "0") { setZoom(1); return; }

    const map = { v: "select", p: "pen", h: "highlight", r: "rect", e: "ellipse", a: "arrow", t: "text", n: "note", c: "comment" };
    const k = e.key.toLowerCase();
    if (k === "l" && e.shiftKey) { AN.setTool("line"); return; }
    if (map[k] && !mod) { AN.setTool(map[k]); }
    if (k === "o" && !mod) { $("file-open").click(); }
    if (k === "l" && !mod && !e.shiftKey) { $("file-load").click(); }
    if (e.key === "?") { $("help-dialog").showModal(); }
  }

  async function checkAutosave() {
    const data = await AN.readAutosave();
    if (data && data.pages && data.pages.length) {
      const when = data.savedAt ? new Date(data.savedAt).toLocaleString() : "earlier";
      $("restore-text").textContent = 'Restore your last session ("' + (data.title || "Untitled") + '", saved ' + when + ")?";
      $("restore-banner").hidden = false;
      AN._pendingRestore = data;
    }
  }
  function restoreSession() {
    $("restore-banner").hidden = true;
    if (AN._pendingRestore && AN.loadSerialized(AN._pendingRestore, { clean: false })) { AN.emit("rerender"); AN.toast("Session restored."); }
  }

  function updateAutosaveStatus(info) {
    const el = $("autosave-status"); if (!el || !info) return;
    el.className = "autosave-status " + info.status;
    if (info.status === "pending") el.textContent = "Changes pending";
    else if (info.status === "saving") el.textContent = "Saving locally…";
    else if (info.status === "saved") el.textContent = "Saved locally";
    else if (info.status === "failed") el.textContent = info.message || "Local save failed";
  }

  function toHex(c) {
    if (/^#([0-9a-f]{6})$/i.test(c)) return c;
    if (/^#([0-9a-f]{3})$/i.test(c)) return "#" + c.slice(1).split("").map(x => x + x).join("");
    return "#e23b3b";
  }

  // ---- touch detection & first-run hint ------------------------------------
  function detectTouch() {
    const touch = (window.matchMedia && matchMedia("(pointer: coarse)").matches) ||
      "ontouchstart" in window || navigator.maxTouchPoints > 0;
    document.body.classList.toggle("is-touch", !!touch);
    return !!touch;
  }
  function maybeShowTouchHint() {
    let seen = false;
    try { seen = localStorage.getItem("annotate-touch-hint") === "1"; } catch (e) {}
    if (seen) return;
    const el = document.createElement("div");
    el.className = "touch-hint";
    el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Touch tips");
    el.innerHTML = '<b>Touch tips</b>' +
      '<span class="gest">✍️ One finger draws with the current tool</span>' +
      '<span class="gest">🤏 Two fingers pan &amp; pinch-zoom</span>' +
      '<span class="gest">👆 Pick the Select tool to scroll with one finger</span>' +
      '<button type="button">Got it</button>';
    el.querySelector("button").addEventListener("click", () => {
      el.remove();
      try { localStorage.setItem("annotate-touch-hint", "1"); } catch (e) {}
      $("welcome-open").focus();
    });
    document.getElementById("viewport").appendChild(el);
    el.querySelector("button").focus();
  }

  // ---- init ----------------------------------------------------------------
  function init() {
    ed.mount();
    buildSwatches();
    wire();
    setupResponsiveActions();
    if (!AN.localPersistenceEnabled) {
      $("welcome-autosave").textContent = "Export editable HTML to save; shared-host persistence is disabled here";
      $("help-privacy").textContent = "Your documents are never uploaded. This shared-host origin intentionally disables autosave and named projects; export editable HTML to save.";
    }
    AN.setTool("select");
    $("color-custom").value = toHex(S.color);
    updatePropbar();
    updatePageNav(0);
    if (detectTouch()) maybeShowTouchHint();
    checkAutosave();
    global.addEventListener("beforeunload", (e) => {
      if (!AN.isDirty()) return;
      e.preventDefault(); e.returnValue = "";
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

})(window);

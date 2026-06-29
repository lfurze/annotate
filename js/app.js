/* Annotate — UI wiring & init. Apache-2.0 */
(function (global) {
  "use strict";
  const AN = global.AN, ed = AN.editor, io = AN.io, S = AN.settings;
  const $ = (id) => document.getElementById(id);

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

  // ---- property bar --------------------------------------------------------
  const COLOR_GROUP = $("color-swatches"), HL_GROUP = $("hl-swatches");

  function buildSwatches() {
    AN.PEN_COLORS.forEach(c => COLOR_GROUP.appendChild(swatch(c, () => onColorPick(c))));
    AN.HL_COLORS.forEach(c => HL_GROUP.appendChild(swatch(c, () => onHlPick(c))));
  }
  function swatch(color, fn) {
    const b = document.createElement("button");
    b.className = "swatch"; b.style.background = color; b.dataset.color = color.toLowerCase();
    b.title = color; b.addEventListener("click", fn);
    return b;
  }

  function sel() { const id = ed.selectedId(); return id ? AN.getAnn(id) : null; }

  // what do the colour controls currently target?
  function colorTargetIsHl() {
    const a = sel();
    if (a) return a.type === "highlight" || a.type === "note";
    return S.tool === "highlight" || S.tool === "note";
  }

  function onColorPick(c) {
    const a = sel();
    if (a && ["pen", "rect", "ellipse", "line", "arrow", "text", "comment"].includes(a.type)) ed.applyStyleToSelection({ color: c });
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
    COLOR_GROUP.querySelectorAll(".swatch").forEach(s => s.classList.toggle("active", s.dataset.color === curColor));
    HL_GROUP.querySelectorAll(".swatch").forEach(s => s.classList.toggle("active", s.dataset.color === curColor));
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
    }
    refreshSwatchActive();
  }

  AN.on("selection", () => updatePropbar());

  // ---- file open / load ----------------------------------------------------
  async function openFile(file) {
    if (!file) return;
    showLoading(true);
    try {
      await AN.importFile(file, (n, total) => setLoading("Rendering page " + n + " of " + total + "…"));
      AN.setTool("select");
      AN.toast("Opened " + file.name);
    } catch (e) {
      console.error(e);
      AN.toast(e.message || "Couldn't open that file.");
    } finally { showLoading(false); }
  }

  let loadingEl;
  function showLoading(on) {
    if (on) {
      if (!loadingEl) { loadingEl = document.createElement("div"); loadingEl.className = "page-loading"; loadingEl.innerHTML = '<span class="spinner"></span><span class="ltext">Loading…</span>'; }
      const pages = $("pages"); pages.hidden = false; pages.innerHTML = ""; pages.appendChild(loadingEl);
      $("welcome").style.display = "none";
    } else if (loadingEl && loadingEl.parentNode) { /* render() will replace it */ }
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
    $("welcome-open").addEventListener("click", () => $("file-open").click());
    $("welcome-load").addEventListener("click", () => $("file-load").click());
    $("file-open").addEventListener("change", (e) => { openFile(e.target.files[0]); e.target.value = ""; });
    $("file-load").addEventListener("change", (e) => { const f = e.target.files[0]; if (f) io.loadFile(f); e.target.value = ""; });
    // undo / redo
    $("btn-undo").addEventListener("click", () => AN.undo());
    $("btn-redo").addEventListener("click", () => AN.redo());
    AN.on("history", (s) => { $("btn-undo").disabled = !s.canUndo; $("btn-redo").disabled = !s.canRedo; });
    // zoom
    $("btn-zoom-in").addEventListener("click", () => setZoom(S.zoom + 0.1));
    $("btn-zoom-out").addEventListener("click", () => setZoom(S.zoom - 0.1));
    $("zoom-label").addEventListener("click", () => setZoom(1));
    // help
    $("btn-help").addEventListener("click", () => $("help-dialog").showModal());
    // delete
    $("btn-delete").addEventListener("click", () => ed.deleteSelected());
    // property controls
    $("color-custom").addEventListener("input", (e) => onColorPick(e.target.value));
    $("stroke-width").addEventListener("input", (e) => {
      const v = +e.target.value; $("stroke-width-val").textContent = v;
      const a = sel();
      if (a && ["pen", "highlight", "rect", "ellipse", "line", "arrow"].includes(a.type)) ed.applyStyleToSelection({ width: v });
      else if (S.tool === "highlight") S.hlWidth = v; else S.width = v;
    });
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

  function onKey(e) {
    const tag = (e.target.tagName || "").toLowerCase();
    const editing = e.target.isContentEditable || tag === "input" || tag === "select" || tag === "textarea";
    const mod = e.metaKey || e.ctrlKey;

    if (mod && (e.key === "s" || e.key === "S")) { e.preventDefault(); io.save(); return; }
    if (mod && (e.key === "z" || e.key === "Z")) { e.preventDefault(); e.shiftKey ? AN.redo() : AN.undo(); return; }
    if (mod && (e.key === "y" || e.key === "Y")) { e.preventDefault(); AN.redo(); return; }

    if (e.key === "Escape") {
      if (editing && document.activeElement && document.activeElement.blur) { document.activeElement.blur(); return; }
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
    if (AN._pendingRestore && AN.loadSerialized(AN._pendingRestore)) { AN.emit("rerender"); AN.toast("Session restored."); }
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
    el.innerHTML = '<b>Touch tips</b>' +
      '<span class="gest">✍️ One finger draws with the current tool</span>' +
      '<span class="gest">🤏 Two fingers pan &amp; pinch-zoom</span>' +
      '<span class="gest">👆 Pick the Select tool to scroll with one finger</span>' +
      '<button type="button">Got it</button>';
    el.querySelector("button").addEventListener("click", () => {
      el.remove();
      try { localStorage.setItem("annotate-touch-hint", "1"); } catch (e) {}
    });
    document.getElementById("viewport").appendChild(el);
  }

  // ---- init ----------------------------------------------------------------
  function init() {
    ed.mount();
    buildSwatches();
    wire();
    AN.setTool("select");
    $("color-custom").value = toHex(S.color);
    updatePropbar();
    if (detectTouch()) maybeShowTouchHint();
    checkAutosave();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

})(window);

/* Annotate — editor: page rendering, tools, selection. Apache-2.0 */
(function (global) {
  "use strict";
  const AN = global.AN;
  const SVGNS = "http://www.w3.org/2000/svg";
  const ed = AN.editor = {};

  let pagesEl, viewportEl;
  let selectedId = null;
  const pageEls = {};   // pageId -> { slot, page, bg, svg, htmlLayer, ui }
  let lazyObserver = null;
  const lazyBackgrounds = new WeakMap();

  // Active pointer operation (draw / drag / resize / pan). Registering a cancel
  // lets the touch gesture layer abort an accidental stroke when a 2nd finger lands.
  let activeOp = null;
  ed.cancelActiveOp = function () { if (activeOp) { try { activeOp.cancel(); } catch (e) {} activeOp = null; } };
  ed.viewport = function () { return viewportEl; };
  function setOp(cancel) { activeOp = { cancel }; }
  function clearOp() { activeOp = null; }
  function capturePointer(e) {
    const target = e.currentTarget;
    try { if (target && target.setPointerCapture) target.setPointerCapture(e.pointerId); } catch (_) {}
    return function () { try { if (target && target.hasPointerCapture && target.hasPointerCapture(e.pointerId)) target.releasePointerCapture(e.pointerId); } catch (_) {} };
  }

  AN.on("rerender", () => ed.render());
  AN.on("zoom", () => ed.applyZoom());

  // ---- coordinate helpers --------------------------------------------------
  function svgEl(tag, attrs) {
    const e = document.createElementNS(SVGNS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function ptOnPage(pageId, clientX, clientY) {
    const z = AN.settings.zoom;
    const r = pageEls[pageId].page.getBoundingClientRect();
    return { x: (clientX - r.left) / z, y: (clientY - r.top) / z };
  }

  // ---- page scaffolding ----------------------------------------------------
  ed.mount = function () {
    pagesEl = document.getElementById("pages");
    viewportEl = document.getElementById("viewport");
    document.addEventListener("pointercancel", ed.cancelActiveOp);
    global.addEventListener("blur", ed.cancelActiveOp);
    global.addEventListener("beforeprint", ed.loadAllBackgrounds);
    global.addEventListener("afterprint", ed.refreshLazyBackgrounds);
  };

  ed.render = function () {
    if (!pagesEl) ed.mount();
    selectedId = null;
    AN.emit("selection", null);
    pagesEl.innerHTML = "";
    if (lazyObserver) { lazyObserver.disconnect(); lazyObserver = null; }
    for (const k in pageEls) delete pageEls[k];

    const hasDoc = AN.state.pages.length > 0;
    document.getElementById("welcome").style.display = hasDoc ? "none" : "";
    pagesEl.hidden = !hasDoc;
    if (!hasDoc) return;

    const appendices = [];
    AN.state.pages.forEach((pg, pageIndex) => {
      const slot = document.createElement("div");
      slot.className = "page-slot";
      const page = document.createElement("div");
      page.className = "page";
      page.dataset.page = pg.id;
      page.style.width = pg.w + "px";
      page.style.height = pg.h + "px";

      // background
      if (pg.kind === "image") {
        const img = document.createElement("img");
        img.className = "bg"; img.alt = ""; lazyBackgrounds.set(img, pg.bg);
        page.appendChild(img);
        if (pg.pdfText && pg.pdfText.length) page.appendChild(buildPdfTextLayer(pg.pdfText));
      } else {
        const div = document.createElement("div");
        div.className = "bg-html";
        div.innerHTML = AN.security.sanitizeDocumentHtml(pg.html || "");
        page.appendChild(div);
      }

      const svg = svgEl("svg", { class: "vector", viewBox: "0 0 " + pg.w + " " + pg.h });
      const htmlLayer = document.createElement("div"); htmlLayer.className = "html-layer";
      const commentAnchors = document.createElement("div"); commentAnchors.className = "comment-anchor-layer";
      const commentRail = document.createElement("section"); commentRail.className = "comment-rail"; commentRail.setAttribute("aria-label", "Margin comments for page " + (pageIndex + 1));
      const commentAppendix = document.createElement("section"); commentAppendix.className = "comment-appendix"; commentAppendix.dataset.page = pg.id; commentAppendix.setAttribute("aria-label", "Comments continued from page " + (pageIndex + 1));
      const ui = svgEl("svg", { class: "ui-layer", viewBox: "0 0 " + pg.w + " " + pg.h });

      page.appendChild(svg); page.appendChild(htmlLayer); page.appendChild(commentAnchors); page.appendChild(commentRail); page.appendChild(ui);
      slot.appendChild(page); pagesEl.appendChild(slot); appendices.push(commentAppendix);
      pageEls[pg.id] = { slot, page, svg, htmlLayer, commentAnchors, commentRail, commentAppendix, ui };

      attachPagePointer(pg.id);
    });
    appendices.forEach(appendix => pagesEl.appendChild(appendix));

    ed.applyZoom();
    ed.refreshLazyBackgrounds();
    renderAllAnnotations();
  };

  ed.loadAllBackgrounds = function () {
    // Printing needs every raster page at once. Suspend lazy unloading first so
    // an off-screen page cannot lose its src again while it is being decoded.
    if (lazyObserver) { lazyObserver.disconnect(); lazyObserver = null; }
    const images = Array.from(document.querySelectorAll("#pages img.bg"));
    images.forEach(img => { const src = lazyBackgrounds.get(img); if (src && img.src !== src) img.src = src; });
    return images;
  };
  ed.refreshLazyBackgrounds = function () {
    const images = Array.from(document.querySelectorAll("#pages img.bg"));
    if (lazyObserver) lazyObserver.disconnect();
    if (!("IntersectionObserver" in global) || !viewportEl) { ed.loadAllBackgrounds(); return; }
    lazyObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const img = entry.target, src = lazyBackgrounds.get(img);
        if (entry.isIntersecting) { if (src && img.src !== src) img.src = src; }
        else img.removeAttribute("src");
      });
    }, { root: viewportEl, rootMargin: "1200px 0px" });
    images.forEach(img => lazyObserver.observe(img));
  };

  function buildPdfTextLayer(items) {
    const layer = document.createElement("div");
    layer.className = "pdf-text-layer"; layer.setAttribute("aria-label", "Selectable PDF text");
    items.forEach(item => {
      const span = document.createElement("span");
      span.textContent = item.text;
      span.style.left = item.x + "px"; span.style.top = item.y + "px";
      span.style.fontSize = item.h + "px"; span.style.height = item.h + "px";
      if (item.w) span.style.width = item.w + "px";
      if (item.angle) span.style.transform = "rotate(" + item.angle + "deg)";
      layer.appendChild(span);
    });
    return layer;
  }

  ed.applyZoom = function () {
    const z = AN.settings.zoom;
    AN.state.pages.forEach((pg) => {
      const refs = pageEls[pg.id]; if (!refs) return;
      refs.page.style.transform = "scale(" + z + ")";
      refs.slot.style.width = pg.w * z + "px";
      refs.slot.style.height = pg.h * z + "px";
    });
  };

  // ---- annotation rendering ------------------------------------------------
  function renderAllAnnotations() {
    AN.state.pages.forEach((pg) => {
      const refs = pageEls[pg.id]; if (!refs) return;
      refs.svg.innerHTML = ""; refs.htmlLayer.innerHTML = ""; refs.commentAnchors.innerHTML = ""; refs.commentRail.innerHTML = ""; refs.commentAppendix.innerHTML = "";
    });
    AN.state.anns.filter(a => a.type !== "comment").forEach(renderAnn);
    AN.state.pages.forEach(pg => renderPageComments(pg.id));
    if (selectedId) drawSelection(selectedId);
  }
  ed.renderAll = renderAllAnnotations;

  function renderAnn(a) {
    const refs = pageEls[a.page]; if (!refs) return;
    if (a.type === "pen" || a.type === "highlight") refs.svg.appendChild(buildStroke(a));
    else if (a.type === "rect" || a.type === "ellipse" || a.type === "line" || a.type === "arrow") refs.svg.appendChild(buildShape(a));
    else if (a.type === "text") refs.htmlLayer.appendChild(buildText(a));
    else if (a.type === "note") refs.htmlLayer.appendChild(buildNote(a));
    else if (a.type === "comment") renderPageComments(a.page);
  }
  function rerenderAnn(a) {
    const refs = pageEls[a.page]; if (!refs) return;
    if (a.type === "comment") { renderPageComments(a.page); if (selectedId === a.id) drawSelection(a.id); return; }
    const existing = refs.page.querySelector('[data-id="' + a.id + '"]');
    if (existing) existing.remove();
    renderAnn(a);
    if (selectedId === a.id) drawSelection(a.id);
  }
  ed.rerenderAnn = rerenderAnn;

  function pathFromPoints(pts) {
    if (!pts.length) return "";
    if (pts.length === 1) { const p = pts[0]; return "M" + p[0] + " " + p[1] + " L" + (p[0] + 0.1) + " " + p[1]; }
    return "M" + pts.map(p => p[0] + " " + p[1]).join(" L");
  }
  function buildStroke(a) {
    const p = svgEl("path", {
      d: pathFromPoints(a.points), fill: "none", stroke: a.color,
      "stroke-width": a.width, "stroke-linecap": "round", "stroke-linejoin": "round",
    });
    p.dataset.id = a.id;
    if (a.type === "highlight") { p.setAttribute("stroke-opacity", "0.4"); p.style.mixBlendMode = "multiply"; }
    return p;
  }
  function buildShape(a) {
    let el;
    if (a.type === "rect") {
      const x = Math.min(a.x, a.x + a.w), y = Math.min(a.y, a.y + a.h);
      el = svgEl("rect", { x, y, width: Math.abs(a.w), height: Math.abs(a.h), rx: 2, fill: "none", stroke: a.color, "stroke-width": a.width });
    } else if (a.type === "ellipse") {
      const cx = a.x + a.w / 2, cy = a.y + a.h / 2;
      el = svgEl("ellipse", { cx, cy, rx: Math.abs(a.w / 2), ry: Math.abs(a.h / 2), fill: "none", stroke: a.color, "stroke-width": a.width });
    } else if (a.type === "line") {
      el = svgEl("line", { x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2, stroke: a.color, "stroke-width": a.width, "stroke-linecap": "round" });
    } else { // arrow
      el = svgEl("g", {});
      const head = Math.max(8, a.width * 3.2);
      const ang = Math.atan2(a.y2 - a.y1, a.x2 - a.x1);
      const bx = a.x2 - head * 0.9 * Math.cos(ang), by = a.y2 - head * 0.9 * Math.sin(ang);
      el.appendChild(svgEl("line", { x1: a.x1, y1: a.y1, x2: bx, y2: by, stroke: a.color, "stroke-width": a.width, "stroke-linecap": "round" }));
      const a1 = ang - Math.PI / 7, a2 = ang + Math.PI / 7;
      const p1x = a.x2 - head * Math.cos(a1), p1y = a.y2 - head * Math.sin(a1);
      const p2x = a.x2 - head * Math.cos(a2), p2y = a.y2 - head * Math.sin(a2);
      el.appendChild(svgEl("path", { d: "M" + a.x2 + " " + a.y2 + " L" + p1x + " " + p1y + " L" + p2x + " " + p2y + " Z", fill: a.color, stroke: a.color, "stroke-width": 1, "stroke-linejoin": "round" }));
    }
    el.dataset.id = a.id;
    return el;
  }

  function applyTextStyle(node, a) {
    node.style.color = a.color;
    node.style.fontFamily = a.fontFamily;
    node.style.fontSize = a.fontSize + "px";
    node.style.fontWeight = a.bold ? "700" : "400";
    node.style.fontStyle = a.italic ? "italic" : "normal";
  }
  function buildText(a) {
    const wrap = document.createElement("div");
    wrap.className = "ann ann-text"; wrap.dataset.id = a.id;
    wrap.style.left = a.x + "px"; wrap.style.top = a.y + "px";
    if (a.w) { wrap.style.width = a.w + "px"; }
    applyTextStyle(wrap, a);
    wrap.textContent = a.text || "";
    wrap.appendChild(handle("br"));
    bindHtmlAnn(wrap, a, { editTarget: wrap, getText: () => wrap.textContent, setText: (t) => a.text = t });
    return wrap;
  }
  function buildNote(a) {
    const wrap = document.createElement("div");
    wrap.className = "ann ann-note"; wrap.dataset.id = a.id;
    wrap.style.left = a.x + "px"; wrap.style.top = a.y + "px";
    wrap.style.width = (a.w || 200) + "px"; wrap.style.minHeight = (a.h || 120) + "px";
    wrap.style.background = a.color;
    const body = document.createElement("div");
    body.className = "note-body"; body.textContent = a.text || "";
    wrap.appendChild(body); wrap.appendChild(handle("br"));
    bindHtmlAnn(wrap, a, { editTarget: body, getText: () => body.textContent, setText: (t) => a.text = t,
      onResize: (w, h) => { a.w = w; a.h = h; } });
    return wrap;
  }
  function renderPageComments(pageId) {
    const refs = pageEls[pageId]; if (!refs) return;
    refs.commentAnchors.innerHTML = ""; refs.commentRail.innerHTML = ""; refs.commentAppendix.innerHTML = "";
    const comments = AN.annsForPage(pageId).filter(a => a.type === "comment").sort((a, b) => a.y - b.y || a.x - b.x);
    refs.page.classList.toggle("has-comments", comments.length > 0);
    let nextTop = 8;
    comments.forEach((a, index) => {
      const number = index + 1;
      const anchor = document.createElement("button");
      anchor.type = "button"; anchor.className = "comment-anchor"; anchor.dataset.commentId = a.id;
      anchor.style.left = a.x + "px"; anchor.style.top = a.y + "px"; anchor.style.background = a.color; anchor.style.color = contrastText(a.color);
      anchor.textContent = number; anchor.setAttribute("aria-label", "Go to margin comment " + number);
      anchor.addEventListener("click", e => { e.stopPropagation(); selectAnn(a.id); const card = refs.commentRail.querySelector('[data-id="' + a.id + '"]'); if (card) card.focus(); });
      anchor.addEventListener("pointerdown", e => {
        if (AN.settings.tool !== "select") return; e.preventDefault(); e.stopPropagation(); selectAnn(a.id);
        const start = ptOnPage(pageId, e.clientX, e.clientY), ox = a.x, oy = a.y; const release = capturePointer(e); AN.beginChange();
        const detach = () => { release(); document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); };
        const move = ev => { const p = ptOnPage(pageId, ev.clientX, ev.clientY); a.x = Math.max(0, Math.min(refs.page.clientWidth, ox + p.x - start.x)); a.y = Math.max(0, Math.min(refs.page.clientHeight, oy + p.y - start.y)); anchor.style.left = a.x + "px"; anchor.style.top = a.y + "px"; };
        const up = () => { detach(); clearOp(); AN.endChange(); renderPageComments(pageId); };
        setOp(() => { detach(); a.x = ox; a.y = oy; AN.cancelChange(); renderPageComments(pageId); });
        document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
      });
      anchor.addEventListener("keydown", e => {
        const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!delta) return;
        e.preventDefault(); e.stopPropagation(); const step = e.shiftKey ? 10 : 1; AN.beginChange();
        a.x = Math.max(0, Math.min(refs.page.clientWidth, a.x + delta[0] * step)); a.y = Math.max(0, Math.min(refs.page.clientHeight, a.y + delta[1] * step)); AN.endChange(); renderPageComments(pageId);
        const moved = refs.commentAnchors.querySelector('[data-comment-id="' + a.id + '"]'); if (moved) moved.focus();
      });
      refs.commentAnchors.appendChild(anchor);

      const card = document.createElement("article"); card.className = "ann ann-comment"; card.dataset.id = a.id; card.tabIndex = 0;
      card.style.top = Math.max(nextTop, Math.min(a.y - 18, Math.max(8, refs.page.clientHeight - 100))) + "px";
      card.setAttribute("role", "group");
      const meta = document.createElement("div"); meta.className = "cmeta";
      const badge = document.createElement("span"); badge.className = "comment-number"; badge.style.background = a.color; badge.style.color = contrastText(a.color); badge.textContent = number;
      meta.appendChild(badge); meta.appendChild(document.createTextNode("Comment"));
      const body = document.createElement("div"); body.className = "cbody"; body.textContent = a.text || ""; body.setAttribute("aria-label", "Margin comment text");
      card.appendChild(meta); card.appendChild(body); refs.commentRail.appendChild(card);
      const startEdit = e => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        selectAnn(a.id); AN.beginChange(); body.setAttribute("contenteditable", "true"); body.focus(); placeCaretEnd(body);
        const finish = () => { body.removeEventListener("blur", finish); body.removeAttribute("contenteditable"); a.text = body.textContent; AN.endChange(); AN.scheduleAutosave(); };
        body.addEventListener("blur", finish);
      };
      card.addEventListener("click", e => { e.stopPropagation(); selectAnn(a.id); });
      card.addEventListener("dblclick", startEdit);
      card.addEventListener("keydown", e => { if (!e.target.isContentEditable && e.key === "Enter") startEdit(e); });
      nextTop = parseFloat(card.style.top) + card.offsetHeight + 10;
      const copy = card.cloneNode(true); copy.removeAttribute("tabindex"); refs.commentAppendix.appendChild(copy);
    });
    const overflow = nextTop > refs.page.clientHeight;
    refs.page.classList.toggle("comments-overflow", overflow);
    refs.commentAppendix.classList.toggle("active", overflow);
  }

  function contrastText(hex) {
    const value = String(hex || "#000000").replace("#", "");
    const rgb = [0, 2, 4].map(i => parseInt(value.slice(i, i + 2), 16) / 255).map(c => c <= .03928 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4));
    return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2] > .42 ? "#111827" : "#ffffff";
  }

  function handle(kind) { const h = document.createElement("div"); h.className = "handle " + kind; h.dataset.handle = kind; return h; }

  // ---- HTML annotation interaction (drag / resize / edit / select) ---------
  function bindHtmlAnn(wrap, a, opts) {
    opts = opts || {};
    wrap.tabIndex = 0;
    wrap.setAttribute("role", "button");
    wrap.setAttribute("aria-label", (a.type === "text" ? "Text annotation" : a.type === "note" ? "Sticky note" : "Comment") + (a.text ? ": " + a.text.slice(0, 80) : "") + ". Press Enter to edit; use arrow keys to move.");
    wrap.setAttribute("aria-keyshortcuts", "Enter ArrowUp ArrowDown ArrowLeft ArrowRight Delete");
    const dragEl = opts.dragHandleSel ? wrap.querySelector(opts.dragHandleSel) : wrap;

    dragEl.addEventListener("pointerdown", (e) => {
      if (AN.settings.tool !== "select") return;        // only interact in select mode
      if (e.target.dataset.handle) return;               // handled below
      if (wrap.querySelector('[contenteditable="true"]')) return; // editing: let text select
      e.stopPropagation();
      selectAnn(a.id);
      const start = ptOnPage(a.page, e.clientX, e.clientY);
      const ox = a.x, oy = a.y; let moved = false;
      const release = capturePointer(e);
      AN.beginChange();
      const detach = () => { release(); document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); };
      const move = (ev) => {
        const p = ptOnPage(a.page, ev.clientX, ev.clientY);
        a.x = ox + (p.x - start.x); a.y = oy + (p.y - start.y);
        wrap.style.left = a.x + "px"; wrap.style.top = a.y + "px";
        moved = true; drawSelection(a.id);
      };
      const up = (ev) => {
        detach(); clearOp();
        AN.endChange();
        if (!moved && opts.onClickHandle) opts.onClickHandle();
      };
      setOp(() => { detach(); a.x = ox; a.y = oy; wrap.style.left = ox + "px"; wrap.style.top = oy + "px"; drawSelection(a.id); AN.cancelChange(); });
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up);
    });

    // double-click to edit text
    const editTarget = opts.editTarget;
    if (editTarget) {
      const startEdit = (e) => {
        if (AN.settings.tool !== "select" && AN.settings.tool !== "text" && AN.settings.tool !== "note" && AN.settings.tool !== "comment") return;
        e.stopPropagation();
        selectAnn(a.id);
        if (opts.onClickHandle && a.open === false) { a.open = true; wrap.classList.add("open"); }
        AN.beginChange();
        // defer focus + caret-to-end so the dblclick's native word-selection
        // doesn't get overwritten (otherwise typing replaces the word).
        requestAnimationFrame(() => {
          editTarget.setAttribute("contenteditable", "true");
          editTarget.focus();
          placeCaretEnd(editTarget);
          const finish = () => {
            editTarget.removeEventListener("blur", finish);
            editTarget.removeAttribute("contenteditable");
            opts.setText(opts.getText());
            AN.endChange();
            AN.scheduleAutosave();
          };
          editTarget.addEventListener("blur", finish);
        });
      };
      wrap.addEventListener("dblclick", startEdit);
      wrap.addEventListener("keydown", e => {
        if (e.target.isContentEditable) return;
        if (e.key === "Enter") { e.preventDefault(); startEdit(e); return; }
        const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        if (!delta) return;
        e.preventDefault(); e.stopPropagation(); AN.beginChange();
        const step = e.shiftKey ? 10 : 1; a.x += delta[0] * step; a.y += delta[1] * step;
        wrap.style.left = a.x + "px"; wrap.style.top = a.y + "px"; AN.endChange(); drawSelection(a.id);
      });
    }

    // resize handle
    const br = wrap.querySelector(".handle.br");
    if (br) {
      br.addEventListener("pointerdown", (e) => {
        if (AN.settings.tool !== "select") return;
        e.stopPropagation(); e.preventDefault();
        selectAnn(a.id);
        const start = ptOnPage(a.page, e.clientX, e.clientY);
        const ow = wrap.offsetWidth, oh = wrap.offsetHeight;
        const oldW = a.w, oldH = a.h;
        const release = capturePointer(e);
        AN.beginChange();
        const detach = () => { release(); document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); };
        const move = (ev) => {
          const p = ptOnPage(a.page, ev.clientX, ev.clientY);
          const w = Math.max(40, ow + (p.x - start.x));
          const h = Math.max(24, oh + (p.y - start.y));
          wrap.style.width = w + "px";
          if (a.type === "note") wrap.style.minHeight = h + "px";
          a.w = w; if (opts.onResize) opts.onResize(w, h); else a.w = w;
          drawSelection(a.id);
        };
        const up = () => { detach(); clearOp(); AN.endChange(); };
        setOp(() => {
          detach(); a.w = oldW; a.h = oldH;
          wrap.style.width = ow + "px";
          if (a.type === "note") wrap.style.minHeight = oh + "px";
          drawSelection(a.id); AN.cancelChange();
        });
        document.addEventListener("pointermove", move);
        document.addEventListener("pointerup", up);
      });
    }
  }

  // ---- page-level pointer (drawing + vector selection) ---------------------
  function attachPagePointer(pageId) {
    const refs = pageEls[pageId];
    refs.page.addEventListener("pointerdown", (e) => {
      const tool = AN.settings.tool;
      if (e.button !== 0) return;
      if (tool === "select" && e.target.closest && e.target.closest(".pdf-text-layer span")) return;
      const p = ptOnPage(pageId, e.clientX, e.clientY);

      if (tool === "select") { trySelectVector(pageId, p, e); return; }
      if (tool === "pen" || tool === "highlight") { startFreehand(pageId, p, e, tool); return; }
      if (tool === "rect" || tool === "ellipse" || tool === "line" || tool === "arrow") { startShape(pageId, p, e, tool); return; }
      if (tool === "text") { placeText(pageId, p); return; }
      if (tool === "note") { placeNote(pageId, p); return; }
      if (tool === "comment") { placeComment(pageId, p); return; }
    });
  }

  // freehand pen / highlighter
  function startFreehand(pageId, p, e, tool) {
    e.preventDefault();
    const release = capturePointer(e);
    const a = { id: AN.uid(), page: pageId, type: tool,
      color: tool === "highlight" ? AN.settings.hlColor : AN.settings.color,
      width: tool === "highlight" ? AN.settings.hlWidth : AN.settings.width,
      points: [[r2(p.x), r2(p.y)]] };
    const refs = pageEls[pageId];
    const node = buildStroke(a); refs.svg.appendChild(node);
    const detach = () => { release(); document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); };
    const move = (ev) => {
      const q = ptOnPage(pageId, ev.clientX, ev.clientY);
      const last = a.points[a.points.length - 1];
      if (Math.hypot(q.x - last[0], q.y - last[1]) < 1.2) return;
      a.points.push([r2(q.x), r2(q.y)]);
      node.setAttribute("d", pathFromPoints(a.points));
    };
    const up = () => {
      detach(); clearOp(); node.remove();
      if (a.points.length > 2) a.points = simplifyPoints(a.points, tool === "highlight" ? 1.5 : 0.65);
      AN.addAnn(a); renderAnn(a);
    };
    setOp(() => { detach(); node.remove(); });   // cancel: discard the in-progress stroke
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  }

  // shapes (rect / ellipse / line / arrow) — drag from corner/endpoint
  function startShape(pageId, p, e, tool) {
    e.preventDefault();
    const release = capturePointer(e);
    const isLine = (tool === "line" || tool === "arrow");
    const a = isLine
      ? { id: AN.uid(), page: pageId, type: tool, color: AN.settings.color, width: AN.settings.width, x1: r2(p.x), y1: r2(p.y), x2: r2(p.x), y2: r2(p.y) }
      : { id: AN.uid(), page: pageId, type: tool, color: AN.settings.color, width: AN.settings.width, x: r2(p.x), y: r2(p.y), w: 0, h: 0 };
    const refs = pageEls[pageId];
    let node = buildShape(a); refs.svg.appendChild(node);
    const detach = () => { release(); document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); };
    const move = (ev) => {
      const q = ptOnPage(pageId, ev.clientX, ev.clientY);
      if (isLine) {
        a.x2 = r2(q.x); a.y2 = r2(q.y);
        if (ev.shiftKey) { const ang = snapAngle(a.x1, a.y1, a.x2, a.y2); a.x2 = ang.x; a.y2 = ang.y; }
      } else {
        a.w = r2(q.x - a.x); a.h = r2(q.y - a.y);
        if (ev.shiftKey) { const m = Math.max(Math.abs(a.w), Math.abs(a.h)); a.w = Math.sign(a.w || 1) * m; a.h = Math.sign(a.h || 1) * m; }
      }
      const fresh = buildShape(a); refs.svg.replaceChild(fresh, node); node = fresh;
    };
    setOp(() => { detach(); node.remove(); });   // cancel: discard the in-progress shape
    const up = () => {
      detach(); clearOp();
      node.remove();
      const big = isLine ? Math.hypot(a.x2 - a.x1, a.y2 - a.y1) > 3 : (Math.abs(a.w) > 3 && Math.abs(a.h) > 3);
      if (!big) return; // ignore stray clicks
      // normalise rect/ellipse to positive w/h
      if (!isLine && (a.w < 0 || a.h < 0)) { if (a.w < 0) { a.x += a.w; a.w = -a.w; } if (a.h < 0) { a.y += a.h; a.h = -a.h; } }
      AN.addAnn(a); renderAnn(a); selectAnn(a.id);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  }

  // Begin editing a freshly-placed element. Focus is deferred to the next frame
  // so the browser's default mousedown focusing doesn't immediately blur it.
  function beginEdit(editEl, commit) {
    requestAnimationFrame(() => {
      editEl.setAttribute("contenteditable", "true");
      editEl.focus();
      placeCaretEnd(editEl);
      const finish = () => { editEl.removeEventListener("blur", finish); editEl.removeAttribute("contenteditable"); commit(); AN.scheduleAutosave(); };
      editEl.addEventListener("blur", finish);
    });
  }
  function placeCaretEnd(el) {
    try {
      const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    } catch (e) {}
  }

  function placeText(pageId, p) {
    const s = AN.settings;
    const a = AN.addAnn({ page: pageId, type: "text", x: r2(p.x), y: r2(p.y), text: "",
      color: s.color, fontFamily: s.fontFamily, fontSize: s.fontSize, bold: s.bold, italic: s.italic });
    renderAnn(a); selectAnn(a.id);
    AN.setTool("select");
    const el = pageEls[pageId].htmlLayer.querySelector('[data-id="' + a.id + '"]');
    beginEdit(el, () => { a.text = el.textContent; if (!a.text.trim()) { AN.removeAnn(a.id); el.remove(); } });
  }
  function placeNote(pageId, p) {
    const a = AN.addAnn({ page: pageId, type: "note", x: r2(p.x), y: r2(p.y), w: 200, h: 120, text: "", color: AN.settings.hlColor });
    renderAnn(a); selectAnn(a.id);
    AN.setTool("select");
    const body = pageEls[pageId].htmlLayer.querySelector('[data-id="' + a.id + '"] .note-body');
    beginEdit(body, () => { a.text = body.textContent; });
  }
  function placeComment(pageId, p) {
    const a = AN.addAnn({ page: pageId, type: "comment", x: r2(p.x), y: r2(p.y), text: "", color: AN.settings.color, open: true });
    renderAnn(a); selectAnn(a.id);
    AN.setTool("select");
    const cbody = pageEls[pageId].commentRail.querySelector('[data-id="' + a.id + '"] .cbody');
    beginEdit(cbody, () => { a.text = cbody.textContent; });
  }

  // ---- vector hit testing & selection --------------------------------------
  function trySelectVector(pageId, p, e) {
    const anns = AN.annsForPage(pageId).filter(a => ["pen", "highlight", "rect", "ellipse", "line", "arrow"].includes(a.type));
    const thr = 8 / AN.settings.zoom;
    let hit = null;
    for (let i = anns.length - 1; i >= 0; i--) { // topmost first
      const a = anns[i];
      if (hitsVector(a, p, thr)) { hit = a; break; }
    }
    if (hit) { selectAnn(hit.id); startVectorDrag(hit, p, e); }
    else { deselect(); startPan(e); }
  }

  // Drag empty canvas to pan (hand-tool). On touch this is the one-finger pan in
  // Select mode; on desktop it's a convenient grab-to-scroll.
  function startPan(e) {
    const vp = viewportEl; if (!vp) return;
    const release = capturePointer(e);
    const sx = vp.scrollLeft, sy = vp.scrollTop, x0 = e.clientX, y0 = e.clientY;
    const detach = () => { release(); document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); };
    const move = (ev) => { vp.scrollLeft = sx - (ev.clientX - x0); vp.scrollTop = sy - (ev.clientY - y0); };
    const up = () => { detach(); clearOp(); };
    setOp(detach);
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  }

  function hitsVector(a, p, thr) {
    const pad = thr + (a.width || 2) / 2;
    if (a.type === "pen" || a.type === "highlight") {
      for (let i = 1; i < a.points.length; i++) if (distToSeg(p, a.points[i - 1], a.points[i]) <= pad) return true;
      if (a.points.length === 1) return Math.hypot(p.x - a.points[0][0], p.y - a.points[0][1]) <= pad;
      return false;
    }
    if (a.type === "line" || a.type === "arrow") return distToSeg(p, [a.x1, a.y1], [a.x2, a.y2]) <= pad;
    if (a.type === "rect" || a.type === "ellipse") {
      const x = Math.min(a.x, a.x + a.w), y = Math.min(a.y, a.y + a.h), w = Math.abs(a.w), h = Math.abs(a.h);
      return p.x >= x - pad && p.x <= x + w + pad && p.y >= y - pad && p.y <= y + h + pad;
    }
    return false;
  }
  function distToSeg(p, a, b) {
    const ax = a[0], ay = a[1], bx = b[0], by = b[1];
    const dx = bx - ax, dy = by - ay; const len2 = dx * dx + dy * dy;
    let t = len2 ? ((p.x - ax) * dx + (p.y - ay) * dy) / len2 : 0; t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx, cy = ay + t * dy;
    return Math.hypot(p.x - cx, p.y - cy);
  }

  function startVectorDrag(a, p, e) {
    e.preventDefault();
    const release = capturePointer(e);
    const start = p;
    const orig = JSON.stringify(a);
    AN.beginChange();
    const detach = () => { release(); document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); };
    const move = (ev) => {
      const q = ptOnPage(a.page, ev.clientX, ev.clientY);
      const dx = q.x - start.x, dy = q.y - start.y;
      const o = JSON.parse(orig);
      if (a.points) a.points = o.points.map(pt => [r2(pt[0] + dx), r2(pt[1] + dy)]);
      else if (a.type === "line" || a.type === "arrow") { a.x1 = o.x1 + dx; a.y1 = o.y1 + dy; a.x2 = o.x2 + dx; a.y2 = o.y2 + dy; }
      else { a.x = o.x + dx; a.y = o.y + dy; }
      rerenderAnn(a);
    };
    const up = () => { detach(); clearOp(); AN.endChange(); };
    setOp(() => { detach(); Object.assign(a, JSON.parse(orig)); rerenderAnn(a); AN.cancelChange(); });
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  }

  // ---- selection visuals ---------------------------------------------------
  function bboxOf(a) {
    if (a.type === "pen" || a.type === "highlight") {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      a.points.forEach(pt => { x0 = Math.min(x0, pt[0]); y0 = Math.min(y0, pt[1]); x1 = Math.max(x1, pt[0]); y1 = Math.max(y1, pt[1]); });
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
    if (a.type === "line" || a.type === "arrow") return { x: Math.min(a.x1, a.x2), y: Math.min(a.y1, a.y2), w: Math.abs(a.x2 - a.x1), h: Math.abs(a.y2 - a.y1) };
    return { x: Math.min(a.x, a.x + a.w), y: Math.min(a.y, a.y + a.h), w: Math.abs(a.w), h: Math.abs(a.h) };
  }
  function drawSelection(id) {
    const a = AN.getAnn(id); if (!a) return;
    const refs = pageEls[a.page]; if (!refs) return;
    // html anns show their own outline/handles via .selected class; vector use ui-layer
    if (a.type === "text" || a.type === "note" || a.type === "comment") { clearUiLayers(); markSelectedClass(id); return; }
    clearUiLayers(); markSelectedClass(null);
    const b = bboxOf(a); const pad = 5;
    const rect = svgEl("rect", { x: b.x - pad, y: b.y - pad, width: b.w + pad * 2, height: b.h + pad * 2,
      fill: "none", stroke: "#2f6fed", "stroke-width": 1.2 / AN.settings.zoom, "stroke-dasharray": (5 / AN.settings.zoom) + " " + (4 / AN.settings.zoom) });
    refs.ui.appendChild(rect);
  }
  function clearUiLayers() { for (const k in pageEls) pageEls[k].ui.innerHTML = ""; }
  function markSelectedClass(id) {
    document.querySelectorAll(".ann.selected").forEach(el => el.classList.remove("selected"));
    if (id) { const el = document.querySelector('.ann[data-id="' + id + '"]'); if (el) el.classList.add("selected"); }
  }

  function selectAnn(id) {
    selectedId = id;
    clearUiLayers();
    drawSelection(id);
    AN.emit("selection", AN.getAnn(id));
  }
  ed.selectAnn = selectAnn;
  function deselect() { selectedId = null; clearUiLayers(); markSelectedClass(null); AN.emit("selection", null); }
  ed.deselect = deselect;
  ed.selectedId = () => selectedId;

  ed.deleteSelected = function () {
    if (!selectedId) return;
    const id = selectedId, annotation = AN.getAnn(id); deselect();
    AN.removeAnn(id);
    if (annotation && annotation.type === "comment") { renderPageComments(annotation.page); return; }
    const el = document.querySelector('[data-id="' + id + '"]'); if (el) el.remove();
  };

  // apply current style settings to the selected annotation (live editing)
  ed.applyStyleToSelection = function (patch, options) {
    if (!selectedId) return false;
    const a = AN.getAnn(selectedId); if (!a) return false;
    const continuous = options && options.continuous;
    if (!continuous) AN.beginChange();
    Object.assign(a, patch);
    if (!continuous) AN.endChange();
    rerenderAnn(a);
    return true;
  };

  function r2(n) { return Math.round(n * 100) / 100; }
  function simplifyPoints(points, tolerance) {
    const sqTolerance = tolerance * tolerance;
    function sqSegDist(p, a, b) {
      let x = a[0], y = a[1], dx = b[0] - x, dy = b[1] - y;
      if (dx || dy) { let t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy); if (t > 1) { x = b[0]; y = b[1]; } else if (t > 0) { x += dx * t; y += dy * t; } }
      dx = p[0] - x; dy = p[1] - y; return dx * dx + dy * dy;
    }
    const keep = new Uint8Array(points.length); keep[0] = keep[points.length - 1] = 1;
    const stack = [[0, points.length - 1]];
    while (stack.length) {
      const pair = stack.pop(), first = pair[0], last = pair[1]; let max = sqTolerance, index = 0;
      for (let i = first + 1; i < last; i++) { const d = sqSegDist(points[i], points[first], points[last]); if (d > max) { index = i; max = d; } }
      if (index) { keep[index] = 1; stack.push([first, index], [index, last]); }
    }
    return points.filter((_, i) => keep[i]);
  }
  function snapAngle(x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1; const len = Math.hypot(dx, dy);
    let ang = Math.atan2(dy, dx); ang = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
    return { x: r2(x1 + len * Math.cos(ang)), y: r2(y1 + len * Math.sin(ang)) };
  }

})(window);

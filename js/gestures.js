/* Annotate — touch gestures: two-finger pan + pinch-zoom. Apache-2.0 */
(function (global) {
  "use strict";
  const AN = global.AN;

  function init() {
    const vp = AN.editor && AN.editor.viewport && AN.editor.viewport();
    if (!vp) return;

    const pts = new Map();   // pointerId -> {x,y} (touch only)
    let g = null;            // active gesture state
    let raf = 0;

    function down(e) {
      if (e.pointerType !== "touch") return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        // a second finger means "navigate" — abort whatever the first finger
        // started, and stop this event reaching the editor so it can't begin a
        // second stroke (we're in the capture phase, ahead of the page handler).
        AN.editor.cancelActiveOp();
        e.preventDefault(); e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        const ids = [...pts.keys()], a = pts.get(ids[0]), b = pts.get(ids[1]);
        const r = vp.getBoundingClientRect();
        g = {
          startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
          startMidX: (a.x + b.x) / 2, startMidY: (a.y + b.y) / 2,
          startZoom: AN.settings.zoom,
          startLeft: vp.scrollLeft, startTop: vp.scrollTop,
          rectLeft: r.left, rectTop: r.top,
        };
      }
    }

    function move(e) {
      if (e.pointerType !== "touch" || !pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (g && pts.size >= 2) { e.preventDefault(); if (!raf) raf = requestAnimationFrame(apply); }
    }

    function apply() {
      raf = 0; if (!g) return;
      const ids = [...pts.keys()]; if (ids.length < 2) return;
      const a = pts.get(ids[0]), b = pts.get(ids[1]);
      const curDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const curMidX = (a.x + b.x) / 2, curMidY = (a.y + b.y) / 2;

      AN.setZoom(g.startZoom * (curDist / g.startDist));   // clamps + re-lays-out
      const f = AN.settings.zoom / g.startZoom;
      // keep the content point that was under the start-midpoint under the current midpoint
      const cx = g.startLeft + (g.startMidX - g.rectLeft);
      const cy = g.startTop + (g.startMidY - g.rectTop);
      vp.scrollLeft = cx * f - (curMidX - g.rectLeft);
      vp.scrollTop = cy * f - (curMidY - g.rectTop);
    }

    function up(e) {
      if (e.pointerType !== "touch") return;
      pts.delete(e.pointerId);
      if (pts.size < 2) { g = null; if (raf) { cancelAnimationFrame(raf); raf = 0; } }
    }

    vp.addEventListener("pointerdown", down, { passive: false, capture: true });
    global.addEventListener("pointermove", move, { passive: false });
    global.addEventListener("pointerup", up, { passive: true });
    global.addEventListener("pointercancel", up, { passive: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(window);

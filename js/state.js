/* Annotate — state, history & local autosave. Apache-2.0 */
(function (global) {
  "use strict";

  // Single global namespace shared across the plain script files.
  const AN = global.AN = global.AN || {};

  // ----- document state -----------------------------------------------------
  // pages[]:  { id, w, h, kind:'image'|'html', bg:dataURL|null, html:string|null }
  // anns[]:   { id, page, type, ... }  (geometry in page-natural coordinates)
  const state = AN.state = {
    pages: [],
    anns: [],
    title: "Untitled",
    nextId: 1,
  };

  AN.uid = function () { return "a" + (state.nextId++).toString(36) + Date.now().toString(36).slice(-3); };

  // ----- tool / style settings ----------------------------------------------
  AN.settings = {
    tool: "select",
    color: "#e23b3b",          // pen / shape / text colour
    hlColor: "#ffe14d",        // highlighter colour
    width: 3,                  // stroke width (pen/shape)
    hlWidth: 18,               // highlighter width
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    fontSize: 16,
    bold: false,
    italic: false,
    zoom: 1,
  };

  AN.HL_COLORS = ["#ffe14d", "#9be870", "#ff9ad1", "#74d0ff", "#ffb35c", "#c79bff"];
  AN.PEN_COLORS = ["#e23b3b", "#1f2430", "#2f6fed", "#18a558", "#f5a623", "#ffffff"];

  // ----- listeners ----------------------------------------------------------
  const listeners = {};
  AN.on = function (evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); };
  AN.emit = function (evt, data) { (listeners[evt] || []).forEach(fn => { try { fn(data); } catch (e) { console.error(e); } }); };

  // ----- history (undo/redo) ------------------------------------------------
  // We snapshot only the annotations array (backgrounds are immutable after import),
  // which keeps history light and fast.
  const history = { past: [], future: [], limit: 60 };
  let suspendHistory = false;

  function snapshot() { return JSON.stringify(state.anns); }

  AN.commit = function (label) {
    if (suspendHistory) return;
    history.past.push(snapshot());
    if (history.past.length > history.limit) history.past.shift();
    history.future.length = 0;
    AN.emit("history", historyStatus());
    AN.scheduleAutosave();
  };

  // capture the baseline *before* a mutation; pairs with commit() after.
  let pending = null;
  AN.beginChange = function () { pending = snapshot(); };
  AN.cancelChange = function () { pending = null; };  // discard an aborted edit without committing
  AN.endChange = function () {
    if (suspendHistory || pending === null) { pending = null; return; }
    if (pending !== snapshot()) {
      history.past.push(pending);
      if (history.past.length > history.limit) history.past.shift();
      history.future.length = 0;
      AN.emit("history", historyStatus());
      AN.scheduleAutosave();
    }
    pending = null;
  };

  function historyStatus() { return { canUndo: history.past.length > 0, canRedo: history.future.length > 0 }; }
  AN.historyStatus = historyStatus;

  AN.undo = function () {
    if (!history.past.length) return;
    history.future.push(snapshot());
    state.anns = JSON.parse(history.past.pop());
    AN.emit("history", historyStatus());
    AN.emit("rerender");
    AN.scheduleAutosave();
  };
  AN.redo = function () {
    if (!history.future.length) return;
    history.past.push(snapshot());
    state.anns = JSON.parse(history.future.pop());
    AN.emit("history", historyStatus());
    AN.emit("rerender");
    AN.scheduleAutosave();
  };

  AN.resetHistory = function () { history.past.length = 0; history.future.length = 0; AN.emit("history", historyStatus()); };

  AN.withSuspendedHistory = function (fn) { suspendHistory = true; try { fn(); } finally { suspendHistory = false; } };

  // ----- annotation helpers -------------------------------------------------
  AN.addAnn = function (ann) {
    AN.beginChange();
    ann.id = ann.id || AN.uid();
    state.anns.push(ann);
    AN.endChange();
    return ann;
  };
  AN.removeAnn = function (id) {
    const i = state.anns.findIndex(a => a.id === id);
    if (i < 0) return;
    AN.beginChange();
    state.anns.splice(i, 1);
    AN.endChange();
  };
  AN.getAnn = function (id) { return state.anns.find(a => a.id === id); };
  AN.annsForPage = function (pageId) { return state.anns.filter(a => a.page === pageId); };

  // ----- local autosave (IndexedDB; falls back to no-op) --------------------
  const DB_NAME = "annotate-db", STORE = "sessions", KEY = "current";
  let dbPromise = null;
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
    return dbPromise;
  }

  function serialize() {
    return { v: 1, savedAt: AN._now(), title: state.title, nextId: state.nextId, pages: state.pages, anns: state.anns };
  }
  AN.serialize = serialize;

  AN.loadSerialized = function (data) {
    if (!data || !Array.isArray(data.pages)) return false;
    state.pages = data.pages;
    state.anns = Array.isArray(data.anns) ? data.anns : [];
    state.title = data.title || "Untitled";
    state.nextId = data.nextId || (state.anns.length + state.pages.length + 10);
    AN.resetHistory();
    return true;
  };

  let autosaveTimer = null;
  AN.scheduleAutosave = function () {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(AN.autosaveNow, 600);
  };
  AN.autosaveNow = async function () {
    if (!state.pages.length) return;
    const db = await openDB(); if (!db) return;
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(serialize(), KEY);
    } catch (e) { /* storage full / private mode — ignore */ }
  };
  AN.readAutosave = async function () {
    const db = await openDB(); if (!db) return null;
    return new Promise((resolve) => {
      try {
        const req = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  };
  AN.clearAutosave = async function () {
    const db = await openDB(); if (!db) return;
    try { db.transaction(STORE, "readwrite").objectStore(STORE).delete(KEY); } catch (e) {}
  };

  // time helper (Date is fine in the browser; abstracted for testability)
  AN._now = function () { return new Date().toISOString(); };

})(window);

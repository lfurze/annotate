/* Annotate — state, history & local autosave. Apache-2.0 */
(function (global) {
  "use strict";

  // Single global namespace shared across the plain script files.
  const AN = global.AN = global.AN || {};
  // GitHub project Pages share one origin across repositories, so sibling apps
  // could read origin-scoped IndexedDB. Keep persistence off there unless the
  // deployment uses its own custom origin.
  AN.persistenceAllowedForHost = hostname => !/\.github\.io$/i.test(String(hostname || ""));
  AN.localPersistenceEnabled = AN.persistenceAllowedForHost(global.location.hostname);

  // ----- document state -----------------------------------------------------
  // pages[]:  { id, w, h, kind:'image'|'html', bg, html, pdfText[], thumb }
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
  let cleanAnnotations = "[]", cleanDocument = "", dirty = false;

  function snapshot() { return JSON.stringify(state.anns); }
  function documentKey() { return JSON.stringify({ title: state.title, pages: state.pages.map(p => [p.id, p.kind, p.w, p.h]) }); }
  function refreshDirty() {
    const next = snapshot() !== cleanAnnotations || documentKey() !== cleanDocument;
    if (next !== dirty) { dirty = next; AN.emit("dirty", dirty); }
    return dirty;
  }
  AN.isDirty = function () { return dirty; };
  AN.markClean = function () { cleanAnnotations = snapshot(); cleanDocument = documentKey(); refreshDirty(); };
  AN.markDirty = function () { if (!dirty) { dirty = true; AN.emit("dirty", true); } };

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
      refreshDirty();
      AN.emit("change");
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
    refreshDirty();
    AN.emit("change");
  };
  AN.redo = function () {
    if (!history.future.length) return;
    history.past.push(snapshot());
    state.anns = JSON.parse(history.future.pop());
    AN.emit("history", historyStatus());
    AN.emit("rerender");
    AN.scheduleAutosave();
    refreshDirty();
    AN.emit("change");
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
  AN.movePage = function (from, to) {
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= state.pages.length || to >= state.pages.length || from === to) return false;
    const page = state.pages.splice(from, 1)[0]; state.pages.splice(to, 0, page);
    AN.markDirty(); AN.emit("rerender"); AN.emit("change"); AN.scheduleAutosave(); return true;
  };
  AN.deletePage = function (pageId) {
    if (state.pages.length <= 1) return false;
    const index = state.pages.findIndex(p => p.id === pageId); if (index < 0) return false;
    state.pages.splice(index, 1); state.anns = state.anns.filter(a => a.page !== pageId);
    AN.resetHistory(); AN.markDirty(); AN.emit("rerender"); AN.emit("change"); AN.scheduleAutosave(); return true;
  };

  // ----- local autosave (IndexedDB; falls back to no-op) --------------------
  const DB_NAME = "annotate-db", STORE = "sessions", PROJECT_STORE = "projects", PROJECT_DATA_STORE = "project-data", KEY = "current";
  let dbPromise = null;
  function openDB() {
    if (!AN.localPersistenceEnabled) return Promise.resolve(null);
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 3);
        req.onupgradeneeded = (upgradeEvent) => {
          if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
          if (!req.result.objectStoreNames.contains(PROJECT_STORE)) req.result.createObjectStore(PROJECT_STORE, { keyPath: "id" });
          if (!req.result.objectStoreNames.contains(PROJECT_DATA_STORE)) req.result.createObjectStore(PROJECT_DATA_STORE, { keyPath: "id" });
          // v2 temporarily stored metadata and document data together. Split any
          // existing records so listing projects stays lightweight.
          if (upgradeEvent.oldVersion === 2) {
            const metadata = req.transaction.objectStore(PROJECT_STORE);
            const projectData = req.transaction.objectStore(PROJECT_DATA_STORE);
            metadata.openCursor().onsuccess = (event) => {
              const cursor = event.target.result; if (!cursor) return;
              const value = cursor.value;
              if (value && value.data) {
                projectData.put({ id: value.id, data: value.data });
                const clean = { id: value.id, name: value.name, savedAt: value.savedAt, size: value.size };
                cursor.update(clean);
              }
              cursor.continue();
            };
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch (e) { resolve(null); }
    });
    return dbPromise;
  }

  function serialize() {
    return { v: AN.PROJECT_SCHEMA_VERSION, savedAt: AN._now(), title: state.title, nextId: state.nextId, pages: state.pages, anns: state.anns };
  }
  AN.serialize = serialize;

  async function prepareStorageSnapshot(data, useBlobs) {
    if (useBlobs === false) {
      const stored = { ...data, storageFormat: "base64-v1" };
      return { data: stored, size: JSON.stringify(stored).length };
    }
    let blobBytes = 0;
    const pages = await Promise.all(data.pages.map(async page => {
      if (page.kind !== "image" || !page.bg) return { ...page };
      const bgBlob = dataUrlToBlob(page.bg); blobBytes += bgBlob.size;
      return { ...page, bg: null, bgBlob };
    }));
    const stored = { ...data, storageFormat: "blob-v1", pages };
    return { data: stored, size: JSON.stringify(stored).length + blobBytes };
  }
  async function hydrateStorageSnapshot(data) {
    if (!data || !Array.isArray(data.pages)) return data;
    const pages = await Promise.all(data.pages.map(async page => {
      if (!(page.bgBlob instanceof Blob)) return { ...page };
      const bg = await blobToDataUrl(page.bgBlob);
      const clean = { ...page, bg }; delete clean.bgBlob; return clean;
    }));
    const clean = { ...data, pages }; delete clean.storageFormat; return clean;
  }
  const rasterBlobCache = new Map();
  function dataUrlToBlob(url) {
    const cached = rasterBlobCache.get(url); if (cached) return cached;
    const comma = url.indexOf(","), header = url.slice(0, comma), binary = atob(url.slice(comma + 1));
    const match = /^data:([^;]+);base64$/i.exec(header); if (!match) throw new Error("Invalid raster data.");
    const bytes = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: match[1].toLowerCase() });
    if (rasterBlobCache.size >= 1000) rasterBlobCache.clear();
    rasterBlobCache.set(url, blob); return blob;
  }
  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error || new Error("Couldn't read stored raster.")); reader.readAsDataURL(blob);
    });
  }

  AN.loadSerialized = function (data, options) {
    let clean;
    try { clean = AN.security.validateSerialized(data); }
    catch (e) { AN.lastLoadError = e; return false; }
    AN.lastLoadError = null;
    state.pages = clean.pages;
    state.anns = clean.anns;
    state.title = clean.title;
    state.nextId = clean.nextId;
    AN.resetHistory();
    if (options && options.clean) AN.markClean();
    else { cleanAnnotations = "[]"; cleanDocument = ""; AN.markDirty(); }
    AN.emit("change");
    return true;
  };

  let autosaveTimer = null;
  AN.scheduleAutosave = function () {
    clearTimeout(autosaveTimer);
    if (state.pages.length) AN.emit("autosave", { status: "pending" });
    autosaveTimer = setTimeout(AN.autosaveNow, 600);
  };
  AN.autosaveNow = async function () {
    if (!state.pages.length) return;
    AN.emit("autosave", { status: "saving" });
    const db = await openDB();
    if (!db) { AN.emit("autosave", { status: "failed", message: AN.localPersistenceEnabled ? "Local autosave is unavailable." : "Export to save; shared-host storage is disabled." }); return false; }
    try {
      const portable = serialize(); let stored = await prepareStorageSnapshot(portable);
      try { await writeAutosave(db, stored.data); }
      catch (_) { stored = await prepareStorageSnapshot(portable, false); await writeAutosave(db, stored.data); }
      AN.emit("autosave", { status: "saved", savedAt: AN._now() });
      return true;
    } catch (e) {
      AN.emit("autosave", { status: "failed", message: "Couldn't save locally. Export your project to avoid losing work." });
      return false;
    }
  };
  async function writeAutosave(db, data) {
    const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).put(data, KEY); await transactionDone(tx);
  }
  AN.readAutosave = async function () {
    const db = await openDB(); if (!db) return null;
    return new Promise((resolve) => {
      try {
        const req = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
        req.onsuccess = async () => { try { resolve(req.result ? await hydrateStorageSnapshot(req.result) : null); } catch (_) { resolve(null); } };
        req.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  };
  AN.clearAutosave = async function () {
    const db = await openDB(); if (!db) return;
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(KEY);
      await transactionDone(tx);
    } catch (e) {}
  };

  // ----- named local projects -----------------------------------------------
  AN.saveLocalProject = async function (name, existingId) {
    if (!state.pages.length) throw new Error("Open a document before saving a local project.");
    const projectName = String(name || state.title || "Untitled").trim().slice(0, 120) || "Untitled";
    const portable = serialize(); let prepared = await prepareStorageSnapshot(portable), data = prepared.data;
    const record = {
      id: existingId || ("p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)),
      name: projectName, savedAt: data.savedAt, size: prepared.size,
    };
    const db = await openDB(); if (!db) throw new Error("Local project storage is unavailable.");
    // WebKit is unreliable when a large Blob write shares a transaction with
    // another object store. Persist data first, then lightweight metadata.
    try { await writeProjectData(db, record.id, data); }
    catch (_) {
      prepared = await prepareStorageSnapshot(portable, false); data = prepared.data; record.size = prepared.size;
      await writeProjectData(db, record.id, data);
    }
    try {
      const metaTx = db.transaction(PROJECT_STORE, "readwrite");
      metaTx.objectStore(PROJECT_STORE).put(record); await transactionDone(metaTx);
    } catch (error) {
      try { const cleanup = db.transaction(PROJECT_DATA_STORE, "readwrite"); cleanup.objectStore(PROJECT_DATA_STORE).delete(record.id); await transactionDone(cleanup); } catch (_) {}
      throw error;
    }
    AN.markClean(); return record;
  };
  async function writeProjectData(db, id, data) {
    const tx = db.transaction(PROJECT_DATA_STORE, "readwrite");
    tx.objectStore(PROJECT_DATA_STORE).put({ id, data }); await transactionDone(tx);
  }
  AN.listLocalProjects = async function () {
    const db = await openDB(); if (!db) return [];
    return new Promise(resolve => {
      try {
        const req = db.transaction(PROJECT_STORE, "readonly").objectStore(PROJECT_STORE).getAll();
        req.onsuccess = () => resolve((req.result || []).sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt))));
        req.onerror = () => resolve([]);
      } catch (_) { resolve([]); }
    });
  };
  AN.readLocalProject = async function (id) {
    const db = await openDB(); if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([PROJECT_STORE, PROJECT_DATA_STORE], "readonly");
        const metaReq = tx.objectStore(PROJECT_STORE).get(id), dataReq = tx.objectStore(PROJECT_DATA_STORE).get(id);
        tx.oncomplete = async () => {
          try {
            const meta = metaReq.result, stored = dataReq.result;
            if (!meta) { resolve(null); return; }
            const raw = stored ? stored.data : meta.data; // v2 fallback during migration edge cases
            resolve(raw ? { ...meta, data: await hydrateStorageSnapshot(raw) } : null);
          } catch (_) { resolve(null); }
        };
        tx.onerror = () => resolve(null); tx.onabort = () => resolve(null);
      } catch (_) { resolve(null); }
    });
  };
  AN.deleteLocalProject = async function (id) {
    const db = await openDB(); if (!db) throw new Error("Local project storage is unavailable.");
    const tx = db.transaction([PROJECT_STORE, PROJECT_DATA_STORE], "readwrite");
    tx.objectStore(PROJECT_STORE).delete(id); tx.objectStore(PROJECT_DATA_STORE).delete(id); await transactionDone(tx); return true;
  };
  AN.storageEstimate = async function () {
    if (!navigator.storage || !navigator.storage.estimate) return null;
    try { return await navigator.storage.estimate(); } catch (_) { return null; }
  };
  function transactionDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Storage transaction failed."));
      tx.onabort = () => reject(tx.error || new Error("Storage transaction was aborted."));
    });
  }

  // time helper (Date is fine in the browser; abstracted for testability)
  AN._now = function () { return new Date().toISOString(); };

})(window);

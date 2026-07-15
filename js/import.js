/* Annotate — document import (PDF / DOCX / image). Apache-2.0 */
(function (global) {
  "use strict";
  const AN = global.AN;

  const PDF_RENDER_SCALE = 2;      // raster resolution multiplier (crisp on retina)
  const DOCX_PAGE_WIDTH = 816;     // 8.5in @ 96dpi — comfortable reading column
  const MAX_IMG_DIM = 2200;        // clamp huge images so the canvas stays sane
  const MAX_PAGE_PIXELS = 16000000;
  const MAX_PDF_PAGES = 500;
  const MAX_FILE_BYTES = { pdf: 75 * 1024 * 1024, docx: 25 * 1024 * 1024, image: 25 * 1024 * 1024 };
  const SAFE_IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp"]);

  function pdfLibraryReady() {
    if (global.pdfjsLib) return Promise.resolve(global.pdfjsLib);
    return new Promise((resolve, reject) => {
      const timer = global.setTimeout(() => {
        global.removeEventListener("annotate-pdf-ready", ready);
        reject(new Error("PDF support failed to load. Serve Annotate over http(s) and reload."));
      }, 10000);
      function ready() {
        global.clearTimeout(timer);
        resolve(global.pdfjsLib);
      }
      global.addEventListener("annotate-pdf-ready", ready, { once: true });
    });
  }

  function readArrayBuffer(file) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = () => rej(fr.error);
      fr.readAsArrayBuffer(file);
    });
  }
  function readDataURL(file) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(file);
    });
  }

  // ---- image -------------------------------------------------------------
  async function importImage(file) {
    const dataUrl = await readDataURL(file);
    const img = await loadImg(dataUrl);
    let w = img.naturalWidth, h = img.naturalHeight;
    if (Math.max(w, h) > MAX_IMG_DIM) {
      const s = MAX_IMG_DIM / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s);
    }
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const bg = canvas.toDataURL("image/jpeg", 0.9);
    const thumb = thumbnailFromCanvas(canvas);
    canvas.width = canvas.height = 0;
    return [{ id: AN.uid(), kind: "image", w, h, bg, html: null, pdfText: [], thumb }];
  }
  function loadImg(src) {
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  }

  // ---- pdf ---------------------------------------------------------------
  async function importPDF(file, onProgress, shouldCancel) {
    const pdfjsLib = await pdfLibraryReady();
    const buf = await readArrayBuffer(file);
    const pdf = await pdfjsLib.getDocument({
      data: buf,
      cMapUrl: "vendor/pdfjs/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "vendor/pdfjs/standard_fonts/",
      wasmUrl: "vendor/pdfjs/wasm/",
    }).promise;
    if (pdf.numPages > MAX_PDF_PAGES) { try { pdf.destroy(); } catch (_) {} throw new Error("This PDF has too many pages (maximum " + MAX_PDF_PAGES + ")."); }
    const pages = [];
    try {
      for (let n = 1; n <= pdf.numPages; n++) {
        abortIfRequested(shouldCancel);
        if (onProgress) onProgress(n, pdf.numPages);
        const page = await pdf.getPage(n);
        const base = page.getViewport({ scale: 1 });             // natural (CSS) size
        if (base.width > AN.security.LIMITS.pageDimension || base.height > AN.security.LIMITS.pageDimension) throw new Error("PDF page " + n + " is too large to render safely.");
        const safeScale = Math.min(PDF_RENDER_SCALE, Math.sqrt(MAX_PAGE_PIXELS / (base.width * base.height)));
        const hi = page.getViewport({ scale: safeScale }); // bounded raster size
        const canvas = document.createElement("canvas");
        try {
          canvas.width = Math.ceil(hi.width); canvas.height = Math.ceil(hi.height);
          const ctx = canvas.getContext("2d", { alpha: false });
          ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport: hi }).promise;
          abortIfRequested(shouldCancel);
          const pdfText = await extractPdfText(page, base, pdfjsLib);
          pages.push({
            id: AN.uid(), kind: "image",
            w: Math.round(base.width), h: Math.round(base.height),
            bg: canvas.toDataURL("image/jpeg", 0.85), html: null, pdfText, thumb: thumbnailFromCanvas(canvas),
          });
        } finally { canvas.width = canvas.height = 0; }
      }
    } finally { try { pdf.destroy(); } catch (_) {} }
    return pages;
  }

  function thumbnailFromCanvas(source) {
    const maxW = 120, maxH = 160, scale = Math.min(maxW / source.width, maxH / source.height, 1);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(source.width * scale)); canvas.height = Math.max(1, Math.round(source.height * scale));
    const ctx = canvas.getContext("2d", { alpha: false }); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/jpeg", 0.6); canvas.width = canvas.height = 0; return data;
  }

  async function extractPdfText(page, viewport, pdfjsLib) {
    const content = await page.getTextContent();
    const out = [];
    for (const item of content.items || []) {
      if (!item || typeof item.str !== "string" || !item.str) continue;
      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
      const h = Math.max(1, Math.hypot(tx[2], tx[3]));
      out.push({
        text: item.str.slice(0, 10000),
        x: Math.round(tx[4] * 100) / 100,
        y: Math.round((tx[5] - h) * 100) / 100,
        w: Math.max(0, Math.round((item.width || 0) * viewport.scale * 100) / 100),
        h: Math.round(h * 100) / 100,
        angle: Math.round(Math.atan2(tx[1], tx[0]) * 180 / Math.PI * 100) / 100,
      });
    }
    return out;
  }

  function abortIfRequested(shouldCancel) {
    if (shouldCancel && shouldCancel()) {
      const error = new Error("Import cancelled."); error.name = "AbortError"; throw error;
    }
  }

  // ---- docx (graceful: convert to HTML, overlay annotations) -------------
  async function importDOCX(file) {
    if (!global.mammoth) throw new Error("DOCX support failed to load.");
    const buf = await readArrayBuffer(file);
    const converted = await convertDocxIsolated(buf);
    const inner = AN.security.sanitizeDocumentHtml(converted);
    const html = wrapDocxHtml(inner);
    // Measure rendered height off-screen so the annotation overlay is sized correctly.
    const h = await measureHtml(html, DOCX_PAGE_WIDTH);
    return [{ id: AN.uid(), kind: "html", w: DOCX_PAGE_WIDTH, h, bg: null, html, pdfText: [], thumb: null }];
  }
  function convertDocxIsolated(buffer) {
    if (!global.Worker) return global.mammoth.convertToHtml({ arrayBuffer: buffer }).then(result => result && result.value ? result.value : "<p>(empty document)</p>");
    return new Promise((resolve, reject) => {
      const worker = new Worker("js/docx-worker.js"), timeout = global.setTimeout(() => { worker.terminate(); reject(new Error("DOCX conversion took too long and was stopped.")); }, 30000);
      worker.onmessage = event => { global.clearTimeout(timeout); worker.terminate(); event.data && event.data.error ? reject(new Error(event.data.error)) : resolve(event.data.html); };
      worker.onerror = () => { global.clearTimeout(timeout); worker.terminate(); reject(new Error("DOCX conversion failed safely.")); };
      worker.postMessage(buffer, [buffer]);
    });
  }

  function wrapDocxHtml(inner) {
    // Self-contained styled block; same CSS is embedded on save for standalone viewing.
    return '<div class="docx">' + inner + "</div>";
  }

  async function measureHtml(html, width) {
    const probe = document.createElement("div");
    probe.style.cssText = "position:absolute;left:-99999px;top:0;visibility:hidden;pointer-events:none;";
    probe.innerHTML = '<div class="bg-html" style="position:static;width:' + width + 'px;">' + html + "</div>";
    document.body.appendChild(probe);
    try {
      const images = Array.from(probe.querySelectorAll("img"));
      await Promise.all(images.map(img => {
        if (img.complete) return img.decode ? img.decode().catch(() => {}) : Promise.resolve();
        return new Promise(resolve => { img.addEventListener("load", resolve, { once: true }); img.addEventListener("error", resolve, { once: true }); });
      }));
      if (document.fonts && document.fonts.ready) await document.fonts.ready.catch(() => {});
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return Math.max(600, Math.ceil(probe.firstChild.scrollHeight) + 80);
    } finally { probe.remove(); }
  }

  // ---- dispatch ----------------------------------------------------------
  AN.importFile = async function (file, onProgress, shouldCancel) {
    const name = (file.name || "").toLowerCase();
    const type = file.type || "";
    let pages, kind;
    if (type === "application/pdf" || name.endsWith(".pdf")) kind = "pdf";
    else if (name.endsWith(".docx") || type.indexOf("officedocument.wordprocessing") >= 0) kind = "docx";
    else if (SAFE_IMAGE_MIMES.has(type.toLowerCase()) || /\.(png|jpe?g|gif|webp|bmp)$/.test(name)) kind = "image";
    else if (name.endsWith(".doc")) throw new Error("Legacy .doc isn't supported — please save as .docx, PDF, or an image.");
    else throw new Error("Unsupported file type. Use PDF, DOCX, or an image.");

    if (file.size > MAX_FILE_BYTES[kind]) throw new Error("That " + kind.toUpperCase() + " file is too large to open safely (maximum " + Math.round(MAX_FILE_BYTES[kind] / 1048576) + " MB).");
    abortIfRequested(shouldCancel);
    if (kind === "pdf") pages = await importPDF(file, onProgress, shouldCancel);
    else if (kind === "docx") pages = await importDOCX(file);
    else pages = await importImage(file);
    abortIfRequested(shouldCancel);

    AN.state.pages = pages;
    AN.state.anns = [];
    AN.state.title = (file.name || "Untitled").replace(/\.[^.]+$/, "");
    AN.resetHistory();
    AN.emit("rerender");
    AN.markDirty();
    AN.scheduleAutosave();
    return pages;
  };

  AN.DOCX_CSS = docxCss();
  function docxCss() {
    return [
      '.bg-html .docx{font:16px/1.6 Georgia,"Times New Roman",serif;color:#1f2430;padding:64px 72px;}',
      '.bg-html .docx p{margin:0 0 12px}',
      '.bg-html .docx h1{font-size:26px;margin:18px 0 10px;line-height:1.25}',
      '.bg-html .docx h2{font-size:21px;margin:16px 0 8px;line-height:1.3}',
      '.bg-html .docx h3{font-size:18px;margin:14px 0 6px}',
      '.bg-html .docx ul,.bg-html .docx ol{margin:0 0 12px 26px}',
      '.bg-html .docx li{margin:0 0 4px}',
      '.bg-html .docx table{border-collapse:collapse;margin:0 0 14px;max-width:100%}',
      '.bg-html .docx td,.bg-html .docx th{border:1px solid #cdd2da;padding:5px 8px;vertical-align:top}',
      '.bg-html .docx img{max-width:100%;height:auto}',
      '.bg-html .docx a{color:#2f6fed}',
      '.bg-html .docx strong{font-weight:700}.bg-html .docx em{font-style:italic}',
    ].join("\n");
  }

})(window);

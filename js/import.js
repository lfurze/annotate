/* Annotate — document import (PDF / DOCX / image). Apache-2.0 */
(function (global) {
  "use strict";
  const AN = global.AN;

  const PDF_RENDER_SCALE = 2;      // raster resolution multiplier (crisp on retina)
  const DOCX_PAGE_WIDTH = 816;     // 8.5in @ 96dpi — comfortable reading column
  const MAX_IMG_DIM = 2200;        // clamp huge images so the canvas stays sane

  // configure pdf.js worker (served path; works on any static host)
  if (global.pdfjsLib && global.pdfjsLib.GlobalWorkerOptions) {
    global.pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";
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
    return [{ id: AN.uid(), kind: "image", w, h, bg: dataUrl, html: null }];
  }
  function loadImg(src) {
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  }

  // ---- pdf ---------------------------------------------------------------
  async function importPDF(file, onProgress) {
    if (!global.pdfjsLib) throw new Error("PDF support failed to load.");
    const buf = await readArrayBuffer(file);
    const pdf = await global.pdfjsLib.getDocument({ data: buf }).promise;
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      if (onProgress) onProgress(n, pdf.numPages);
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });             // natural (CSS) size
      const hi = page.getViewport({ scale: PDF_RENDER_SCALE }); // raster size
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(hi.width); canvas.height = Math.ceil(hi.height);
      const ctx = canvas.getContext("2d", { alpha: false });
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: hi }).promise;
      pages.push({
        id: AN.uid(), kind: "image",
        w: Math.round(base.width), h: Math.round(base.height),
        bg: canvas.toDataURL("image/jpeg", 0.85), html: null,
      });
      canvas.width = canvas.height = 0; // free memory
    }
    try { pdf.destroy(); } catch (e) {}
    return pages;
  }

  // ---- docx (graceful: convert to HTML, overlay annotations) -------------
  async function importDOCX(file) {
    if (!global.mammoth) throw new Error("DOCX support failed to load.");
    const buf = await readArrayBuffer(file);
    const result = await global.mammoth.convertToHtml(
      { arrayBuffer: buf },
      { convertImage: global.mammoth.images.imgElement(async (image) => {
          const b64 = await image.read("base64");
          return { src: "data:" + image.contentType + ";base64," + b64 };
        }) }
    ).catch(async () => global.mammoth.convertToHtml({ arrayBuffer: buf }));

    const inner = (result && result.value) ? result.value : "<p>(empty document)</p>";
    const html = wrapDocxHtml(inner);
    // Measure rendered height off-screen so the annotation overlay is sized correctly.
    const h = await measureHtml(html, DOCX_PAGE_WIDTH);
    return [{ id: AN.uid(), kind: "html", w: DOCX_PAGE_WIDTH, h, bg: null, html }];
  }

  function wrapDocxHtml(inner) {
    // Self-contained styled block; same CSS is embedded on save for standalone viewing.
    return '<div class="docx">' + inner + "</div>";
  }

  function measureHtml(html, width) {
    return new Promise((resolve) => {
      const probe = document.createElement("div");
      probe.style.cssText = "position:absolute;left:-99999px;top:0;visibility:hidden;";
      probe.innerHTML = '<div class="bg-html" style="position:static;width:' + width + 'px;">' + html + "</div>";
      document.body.appendChild(probe);
      // allow images to influence height a touch, then measure
      requestAnimationFrame(() => {
        const el = probe.firstChild;
        const h = Math.max(600, Math.ceil(el.scrollHeight) + 80);
        document.body.removeChild(probe);
        resolve(h);
      });
    });
  }

  // ---- dispatch ----------------------------------------------------------
  AN.importFile = async function (file, onProgress) {
    const name = (file.name || "").toLowerCase();
    const type = file.type || "";
    let pages;
    if (type === "application/pdf" || name.endsWith(".pdf")) pages = await importPDF(file, onProgress);
    else if (name.endsWith(".docx") || type.indexOf("officedocument.wordprocessing") >= 0) pages = await importDOCX(file);
    else if (type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name)) pages = await importImage(file);
    else if (name.endsWith(".doc")) throw new Error("Legacy .doc isn't supported — please save as .docx, PDF, or an image.");
    else throw new Error("Unsupported file type. Use PDF, DOCX, or an image.");

    AN.state.pages = pages;
    AN.state.anns = [];
    AN.state.title = (file.name || "Untitled").replace(/\.[^.]+$/, "");
    AN.resetHistory();
    AN.emit("rerender");
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

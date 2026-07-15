/* Annotate — untrusted document/project validation. Apache-2.0 */
(function (global) {
  "use strict";
  const AN = global.AN;
  const sec = AN.security = {};
  const PROJECT_SCHEMA_VERSION = AN.PROJECT_SCHEMA_VERSION = 1;

  const LIMITS = sec.LIMITS = {
    pages: 500,
    annotations: 20000,
    pointsPerStroke: 50000,
    pointsTotal: 1000000,
    pageDimension: 20000,
    pageHtmlChars: 25000000,
    imageDataChars: 30000000,
    annotationTextChars: 1000000,
    titleChars: 240,
    pdfTextItems: 200000,
  };

  const SAFE_ELEMENTS = new Set([
    "div", "p", "br", "h1", "h2", "h3", "h4", "h5", "h6",
    "strong", "b", "em", "i", "u", "s", "ul", "ol", "li",
    "blockquote", "pre", "code", "table", "thead", "tbody", "tfoot",
    "tr", "th", "td", "a", "img", "span", "sub", "sup",
  ]);
  const SAFE_FONTS = new Set([
    "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    "Georgia, 'Times New Roman', serif",
    "'Courier New', ui-monospace, monospace",
    "'Comic Sans MS', 'Marker Felt', cursive",
  ]);
  const ANN_TYPES = new Set(["pen", "highlight", "rect", "ellipse", "line", "arrow", "text", "note", "comment"]);
  const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;
  const SAFE_COLOR = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i;
  const SAFE_IMAGE = /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i;

  function fail(message) { throw new Error(message); }
  function plainObject(v) {
    if (!v || typeof v !== "object" || Array.isArray(v)) return false;
    const proto = Object.getPrototypeOf(v);
    return proto === Object.prototype || proto === null;
  }
  function finite(v, name, min, max) {
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) fail("Invalid " + name + ".");
    return v;
  }
  function boundedString(v, name, max, fallback) {
    if (v == null && fallback !== undefined) return fallback;
    if (typeof v !== "string" || v.length > max) fail("Invalid " + name + ".");
    return v;
  }
  function color(v, fallback) { return SAFE_COLOR.test(v || "") ? v.toLowerCase() : fallback; }
  function id(v, name) { if (!SAFE_ID.test(v || "")) fail("Invalid " + name + "."); return v; }
  function safeImageData(v) { return typeof v === "string" && v.length <= LIMITS.imageDataChars && SAFE_IMAGE.test(v); }

  function safeHref(value) {
    const s = String(value || "").trim();
    return /^(?:https?:|mailto:)/i.test(s) ? s : "";
  }

  // Convert imported HTML to a fresh tree with a deliberately small allowlist.
  // Remote images, inline styles, event handlers, SVG, forms, and active elements
  // are never copied into the result.
  sec.sanitizeDocumentHtml = function (html) {
    if (typeof html !== "string" || html.length > LIMITS.pageHtmlChars) fail("Document HTML is too large.");
    const parsed = new DOMParser().parseFromString("<body>" + html + "</body>", "text/html");
    const out = document.createElement("div");

    function copyChildren(from, to) { Array.from(from.childNodes).forEach(n => copyNode(n, to)); }
    function copyNode(node, parent) {
      if (node.nodeType === Node.TEXT_NODE) { parent.appendChild(document.createTextNode(node.nodeValue || "")); return; }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const tag = node.tagName.toLowerCase();
      if (!SAFE_ELEMENTS.has(tag)) { copyChildren(node, parent); return; }

      const clean = document.createElement(tag);
      if (tag === "div" && node.classList.contains("docx")) clean.className = "docx";
      if (tag === "a") {
        const href = safeHref(node.getAttribute("href"));
        if (href) clean.setAttribute("href", href);
        clean.setAttribute("rel", "noopener noreferrer");
        clean.setAttribute("target", "_blank");
      }
      if (tag === "img") {
        const src = node.getAttribute("src") || "";
        if (!safeImageData(src)) return;
        clean.setAttribute("src", src.replace(/\s/g, ""));
        clean.setAttribute("alt", boundedString(node.getAttribute("alt") || "", "image alt text", 1000, ""));
      }
      if (tag === "td" || tag === "th") {
        ["colspan", "rowspan"].forEach(attr => {
          const n = Number(node.getAttribute(attr));
          if (Number.isInteger(n) && n >= 1 && n <= 100) clean.setAttribute(attr, String(n));
        });
      }
      copyChildren(node, clean);
      parent.appendChild(clean);
    }

    copyChildren(parsed.body, out);
    return out.innerHTML;
  };

  function canonicalPage(pg, ids, textBudget) {
    if (!plainObject(pg)) fail("Invalid page.");
    const pageId = id(pg.id, "page ID");
    if (ids.has(pageId)) fail("Duplicate page ID.");
    ids.add(pageId);
    const kind = pg.kind;
    if (kind !== "image" && kind !== "html") fail("Unsupported page type.");
    const out = {
      id: pageId,
      kind,
      w: finite(pg.w, "page width", 1, LIMITS.pageDimension),
      h: finite(pg.h, "page height", 1, LIMITS.pageDimension),
      bg: null,
      html: null,
      pdfText: [],
      thumb: null,
    };
    if (kind === "image") {
      if (!safeImageData(pg.bg)) fail("Invalid or unsupported page image.");
      out.bg = pg.bg.replace(/\s/g, "");
      if (pg.thumb != null) {
        if (!safeImageData(pg.thumb) || pg.thumb.length > 500000) fail("Invalid page thumbnail.");
        out.thumb = pg.thumb.replace(/\s/g, "");
      }
      if (pg.pdfText != null) {
        if (!Array.isArray(pg.pdfText)) fail("Invalid PDF text layer.");
        textBudget.count += pg.pdfText.length;
        if (textBudget.count > LIMITS.pdfTextItems) fail("Project contains too much PDF text.");
        out.pdfText = pg.pdfText.map(item => {
          if (!plainObject(item)) fail("Invalid PDF text item.");
          return {
            text: boundedString(item.text, "PDF text", 10000, ""),
            x: finite(item.x, "PDF text x", -LIMITS.pageDimension, LIMITS.pageDimension * 2),
            y: finite(item.y, "PDF text y", -LIMITS.pageDimension, LIMITS.pageDimension * 2),
            w: finite(item.w, "PDF text width", 0, LIMITS.pageDimension),
            h: finite(item.h, "PDF text height", 0.5, 1000),
            angle: finite(item.angle == null ? 0 : item.angle, "PDF text angle", -360, 360),
          };
        });
      }
    } else {
      out.html = sec.sanitizeDocumentHtml(boundedString(pg.html, "page HTML", LIMITS.pageHtmlChars, ""));
    }
    return out;
  }

  function canonicalAnn(a, pageIds, annIds, pointBudget) {
    if (!plainObject(a) || !ANN_TYPES.has(a.type)) fail("Invalid annotation.");
    const annId = id(a.id, "annotation ID");
    if (annIds.has(annId)) fail("Duplicate annotation ID.");
    annIds.add(annId);
    const page = id(a.page, "annotation page ID");
    if (!pageIds.has(page)) fail("Annotation refers to a missing page.");
    const out = { id: annId, page, type: a.type };
    const coord = (v, name) => finite(v, name, -LIMITS.pageDimension * 5, LIMITS.pageDimension * 5);
    const width = () => finite(a.width, "annotation width", 0.25, 200);

    if (a.type === "pen" || a.type === "highlight") {
      if (!Array.isArray(a.points) || !a.points.length || a.points.length > LIMITS.pointsPerStroke) fail("Invalid annotation points.");
      pointBudget.count += a.points.length;
      if (pointBudget.count > LIMITS.pointsTotal) fail("Project contains too many annotation points.");
      out.points = a.points.map(p => {
        if (!Array.isArray(p) || p.length !== 2) fail("Invalid annotation point.");
        return [coord(p[0], "point x"), coord(p[1], "point y")];
      });
      out.color = color(a.color, a.type === "highlight" ? "#ffe14d" : "#e23b3b");
      out.width = width();
    } else if (a.type === "rect" || a.type === "ellipse") {
      out.x = coord(a.x, "annotation x"); out.y = coord(a.y, "annotation y");
      out.w = coord(a.w, "annotation width"); out.h = coord(a.h, "annotation height");
      out.color = color(a.color, "#e23b3b"); out.width = width();
    } else if (a.type === "line" || a.type === "arrow") {
      out.x1 = coord(a.x1, "annotation x1"); out.y1 = coord(a.y1, "annotation y1");
      out.x2 = coord(a.x2, "annotation x2"); out.y2 = coord(a.y2, "annotation y2");
      out.color = color(a.color, "#e23b3b"); out.width = width();
    } else {
      out.x = coord(a.x, "annotation x"); out.y = coord(a.y, "annotation y");
      out.text = boundedString(a.text, "annotation text", LIMITS.annotationTextChars, "");
      out.color = color(a.color, a.type === "note" ? "#ffe14d" : "#e23b3b");
      if (a.type === "text") {
        if (a.w != null) out.w = finite(a.w, "text width", 1, LIMITS.pageDimension);
        out.fontFamily = SAFE_FONTS.has(a.fontFamily) ? a.fontFamily : AN.settings.fontFamily;
        out.fontSize = finite(a.fontSize, "font size", 6, 200);
        out.bold = !!a.bold; out.italic = !!a.italic;
      } else if (a.type === "note") {
        out.w = finite(a.w == null ? 200 : a.w, "note width", 40, LIMITS.pageDimension);
        out.h = finite(a.h == null ? 120 : a.h, "note height", 24, LIMITS.pageDimension);
      } else out.open = !!a.open;
    }
    return out;
  }

  sec.migrateSerialized = function (input) {
    if (!plainObject(input)) fail("Project data must be an object.");
    if (input.v !== PROJECT_SCHEMA_VERSION) fail("This project version is not supported.");
    // Version 1 is the first public portable format. Future migrations belong
    // here and must return a new object rather than mutating untrusted input.
    return input;
  };

  sec.validateSerialized = function (input) {
    input = sec.migrateSerialized(input);
    if (!Array.isArray(input.pages) || input.pages.length > LIMITS.pages) fail("Invalid project pages.");
    if (!Array.isArray(input.anns) || input.anns.length > LIMITS.annotations) fail("Invalid project annotations.");
    const pageIds = new Set(), textBudget = { count: 0 };
    const pages = input.pages.map(pg => canonicalPage(pg, pageIds, textBudget));
    const annIds = new Set(), pointBudget = { count: 0 };
    const anns = input.anns.map(a => canonicalAnn(a, pageIds, annIds, pointBudget));
    return {
      v: PROJECT_SCHEMA_VERSION,
      savedAt: typeof input.savedAt === "string" && input.savedAt.length <= 64 ? input.savedAt : null,
      title: boundedString(input.title, "project title", LIMITS.titleChars, "Untitled"),
      nextId: Number.isSafeInteger(input.nextId) && input.nextId >= 1 ? input.nextId : anns.length + pages.length + 10,
      pages,
      anns,
    };
  };
})(window);

/* Annotate — annotation list and navigation. Apache-2.0 */
(function (global) {
  "use strict";
  const AN = global.AN;
  let aside, list, summary, toggle;

  const LABELS = {
    pen: "Pen stroke", highlight: "Highlight", rect: "Rectangle", ellipse: "Ellipse",
    line: "Line", arrow: "Arrow", text: "Text", note: "Sticky note", comment: "Comment",
  };

  function init() {
    aside = document.getElementById("annotation-sidebar");
    list = document.getElementById("annotation-list");
    summary = document.getElementById("annotation-summary");
    toggle = document.getElementById("btn-annotations");
    toggle.addEventListener("click", () => setOpen(aside.hidden));
    document.getElementById("btn-close-annotations").addEventListener("click", () => setOpen(false));
    AN.on("change", render);
    AN.on("rerender", render);
    AN.on("selection", markSelection);
    render();
  }

  function setOpen(open) {
    aside.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    if (open) {
      const pages = document.getElementById("page-sidebar"), pageButton = document.getElementById("btn-pages");
      if (pages && !pages.hidden) { pages.hidden = true; pageButton.setAttribute("aria-expanded", "false"); }
      render(); const first = list.querySelector("button"); (first || document.getElementById("btn-close-annotations")).focus();
    }
    else responsiveTrigger(toggle).focus();
  }
  function responsiveTrigger(fallback) { const more = document.getElementById("btn-mobile-actions"); return more && !more.hidden ? more : fallback; }

  function render() {
    if (!list) return;
    list.textContent = "";
    summary.textContent = AN.state.anns.length ? AN.state.anns.length + (AN.state.anns.length === 1 ? " annotation" : " annotations") : "No annotations yet.";
    const pageNumbers = new Map(AN.state.pages.map((p, i) => [p.id, i + 1]));
    AN.state.anns.forEach((ann, index) => {
      const button = document.createElement("button");
      button.type = "button"; button.className = "annotation-item"; button.dataset.id = ann.id;
      const heading = document.createElement("span"); heading.className = "annotation-item-title";
      heading.textContent = (LABELS[ann.type] || ann.type) + " · Page " + (pageNumbers.get(ann.page) || "?");
      const preview = document.createElement("span"); preview.className = "annotation-item-preview";
      const text = typeof ann.text === "string" ? ann.text.trim().replace(/\s+/g, " ") : "";
      preview.textContent = text ? text.slice(0, 120) : "Annotation " + (index + 1);
      button.appendChild(heading); button.appendChild(preview);
      button.addEventListener("click", () => navigateTo(ann));
      list.appendChild(button);
    });
    markSelection(AN.editor && AN.editor.selectedId ? AN.getAnn(AN.editor.selectedId()) : null);
  }

  function navigateTo(ann) {
    const pageIndex = AN.state.pages.findIndex(p => p.id === ann.page);
    if (pageIndex >= 0 && AN.goToPage) AN.goToPage(pageIndex);
    AN.setTool("select");
    requestAnimationFrame(() => { AN.editor.selectAnn(ann.id); markSelection(ann); });
  }

  function markSelection(ann) {
    if (!list) return;
    list.querySelectorAll(".annotation-item").forEach(button => {
      const selected = !!ann && button.dataset.id === ann.id;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-current", selected ? "true" : "false");
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(window);

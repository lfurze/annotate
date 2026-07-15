/* Annotate — named on-device project library. Apache-2.0 */
(function (global) {
  "use strict";
  const AN = global.AN;
  let dialog, list, summary, nameInput, trigger;

  function init() {
    dialog = document.getElementById("projects-dialog"); list = document.getElementById("local-project-list");
    summary = document.getElementById("storage-summary"); nameInput = document.getElementById("local-project-name");
    trigger = document.getElementById("btn-projects");
    trigger.addEventListener("click", open);
    document.getElementById("btn-close-projects").addEventListener("click", () => dialog.close());
    document.getElementById("save-local-form").addEventListener("submit", saveCurrent);
    dialog.addEventListener("close", () => { const more = document.getElementById("btn-mobile-actions"); (more && !more.hidden ? more : trigger).focus(); });
    if (!AN.localPersistenceEnabled) {
      nameInput.disabled = true;
      document.querySelector('#save-local-form button[type="submit"]').disabled = true;
    }
  }

  async function open() {
    nameInput.value = AN.state.title || "Untitled"; dialog.showModal(); await render(); nameInput.focus(); nameInput.select();
  }
  async function saveCurrent(e) {
    e.preventDefault();
    const button = e.submitter || e.target.querySelector('button[type="submit"]'); button.disabled = true;
    try { const record = await AN.saveLocalProject(nameInput.value); AN.toast('Saved local project "' + record.name + '".'); await render(); }
    catch (error) { AN.toast(error.message || "Couldn't save that local project."); }
    finally { button.disabled = false; }
  }
  async function render() {
    if (!AN.localPersistenceEnabled) {
      list.textContent = "";
      const note = document.createElement("p"); note.className = "empty-local muted";
      note.textContent = "Named projects and autosave are disabled on shared-host origins. Export an editable HTML file, or use a deployment with its own origin.";
      list.appendChild(note); summary.textContent = "Persistent document storage is intentionally unavailable here."; return;
    }
    const projects = await AN.listLocalProjects(); list.textContent = "";
    if (!projects.length) { const empty = document.createElement("p"); empty.className = "empty-local muted"; empty.textContent = "No named local projects yet."; list.appendChild(empty); }
    projects.forEach(project => list.appendChild(projectRow(project)));
    const estimate = await AN.storageEstimate(), namedBytes = projects.reduce((sum, p) => sum + (p.size || 0), 0);
    let text = projects.length + (projects.length === 1 ? " project" : " projects") + " · about " + formatBytes(namedBytes) + " in named copies";
    if (estimate && estimate.quota) text += " · browser site storage " + formatBytes(estimate.usage || 0) + " of " + formatBytes(estimate.quota);
    summary.textContent = text;
  }
  function projectRow(project) {
    const row = document.createElement("div"); row.className = "local-project-row"; row.dataset.id = project.id;
    const info = document.createElement("div"); info.className = "local-project-info";
    const name = document.createElement("strong"); name.textContent = project.name;
    const meta = document.createElement("span"); meta.textContent = (project.savedAt ? new Date(project.savedAt).toLocaleString() : "Unknown date") + " · " + formatBytes(project.size || 0);
    info.appendChild(name); info.appendChild(meta);
    const actions = document.createElement("div"); actions.className = "local-project-actions";
    const load = document.createElement("button"); load.type = "button"; load.className = "tbtn small"; load.textContent = "Open"; load.addEventListener("click", () => loadProject(project.id));
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "tbtn small danger"; remove.textContent = "Delete"; remove.addEventListener("click", () => deleteProject(project));
    actions.appendChild(load); actions.appendChild(remove); row.appendChild(info); row.appendChild(actions); return row;
  }
  async function loadProject(id) {
    if (!AN.confirmDiscard()) return;
    const record = await AN.readLocalProject(id);
    if (!record || !AN.loadSerialized(record.data, { clean: true })) { AN.toast((AN.lastLoadError && AN.lastLoadError.message) || "Couldn't open that local project."); return; }
    dialog.close(); AN.emit("rerender"); AN.scheduleAutosave(); AN.toast('Opened local project "' + record.name + '".');
  }
  async function deleteProject(project) {
    if (!global.confirm('Delete the local project "' + project.name + '" from this browser?')) return;
    try { await AN.deleteLocalProject(project.id); await render(); AN.toast("Local project deleted."); }
    catch (error) { AN.toast(error.message || "Couldn't delete that local project."); }
  }
  function formatBytes(bytes) {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB"], i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    return (bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0) + " " + units[i];
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})(window);

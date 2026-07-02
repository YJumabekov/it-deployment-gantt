/* IT Product Deployment — interactive Gantt chart.
   Reads/writes webapp/tasks.json directly via the GitHub Contents API so
   changes made by any teammate (with a connected token) land as real commits.
   Without a token, the app is read-only and shows the last published snapshot.
*/

const STORAGE_KEY = "gantt_gh_config_v1";
const COLLAPSE_KEY = "gantt_collapsed_phases_v1";
const DATA_PATH = "webapp/tasks.json"; // path relative to repo root
const PHASE_PREFIX = "__phase__";

// Row geometry fed explicitly into `new Gantt()` below so the name column
// can position rows by formula instead of measuring the rendered SVG.
const HEADER_HEIGHT = 50;
const BAR_HEIGHT = 20;
const BAR_PADDING = 18;
const ROW_HEIGHT = BAR_HEIGHT + BAR_PADDING;

let tasks = [];
let gantt = null;
let currentViewMode = "Month";
let fileSha = null; // sha of tasks.json as last fetched via the API (null when read-only)
let dirty = false;
let editingTaskId = null; // task currently open in the edit modal, or null for "new task"
let collapsedPhases = new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || "[]"));

const el = (id) => document.getElementById(id);

function getConfig() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch (e) {
    return null;
  }
}

function setConfig(cfg) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

function clearConfig() {
  localStorage.removeItem(STORAGE_KEY);
}

function b64EncodeUnicode(str) {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16))
    )
  );
}

function b64DecodeUnicode(str) {
  const clean = str.replace(/\n/g, "");
  return decodeURIComponent(
    atob(clean)
      .split("")
      .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
      .join("")
  );
}

function showToast(message, isError = false) {
  const t = el("toast");
  t.textContent = message;
  t.classList.remove("hidden", "error");
  if (isError) t.classList.add("error");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.add("hidden"), 4000);
}

function setDirty(value) {
  dirty = value;
  const pill = el("statusPill");
  const cfg = getConfig();
  el("saveBtn").disabled = !dirty || !cfg;
  if (!cfg) {
    pill.textContent = "Read-only (viewing published snapshot)";
    pill.className = "status-pill status-readonly";
  } else if (dirty) {
    pill.textContent = "Unsaved changes";
    pill.className = "status-pill status-dirty";
  } else {
    pill.textContent = "Connected — editable";
    pill.className = "status-pill status-editable";
  }
}

async function apiRequest(cfg, method, body) {
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${DATA_PATH}?ref=${encodeURIComponent(cfg.branch)}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

async function loadTasks() {
  const cfg = getConfig();
  if (cfg && cfg.token) {
    try {
      const res = await apiRequest(cfg, "GET");
      if (res.status === 401 || res.status === 403) {
        showToast("Saved token was rejected by GitHub — please reconnect.", true);
        clearConfig();
      } else if (!res.ok) {
        throw new Error(`GitHub API returned ${res.status}`);
      } else {
        const json = await res.json();
        fileSha = json.sha;
        tasks = JSON.parse(b64DecodeUnicode(json.content));
        setDirty(false);
        return;
      }
    } catch (e) {
      showToast("Could not reach GitHub API, falling back to published snapshot.", true);
    }
  }
  // Read-only fallback: whatever was last published to GitHub Pages.
  const res = await fetch("./tasks.json");
  tasks = await res.json();
  fileSha = null;
  setDirty(false);
}

function phaseNumber(phaseLabel) {
  const m = /Phase (\d+)/.exec(phaseLabel || "");
  return m ? m[1] : "0";
}

// Our data model stores `end` as the last inclusive working day (matching
// tasks.csv), but Frappe Gantt treats `end` as an exclusive boundary and
// renders (end - start) days wide. Without the +1 every bar would render
// one day shorter than its actual duration.
function parseLocalDate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(dateStr, n) {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + n);
  return formatDate(d);
}

function phaseParentId(phaseLabel) {
  return PHASE_PREFIX + phaseLabel;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Phases aren't stored as separate tasks — they're derived on every render
// from the distinct `phase` values already on each task, in first-seen
// order, so adding/removing tasks automatically keeps phases in sync.
// Each phase becomes a collapsible synthetic parent row spanning the
// min/max dates of its children.
function buildRenderRows() {
  const phaseOrder = [];
  const phaseGroups = {};
  tasks.forEach((t) => {
    if (!phaseGroups[t.phase]) {
      phaseGroups[t.phase] = [];
      phaseOrder.push(t.phase);
    }
    phaseGroups[t.phase].push(t);
  });

  const rows = [];
  phaseOrder.forEach((phaseLabel) => {
    const children = phaseGroups[phaseLabel];
    const collapsed = collapsedPhases.has(phaseLabel);
    const phaseRow = {
      id: phaseParentId(phaseLabel),
      name: phaseLabel,
      phase: phaseLabel,
      start: children.map((c) => c.start).reduce((a, b) => (a < b ? a : b)),
      end: children.map((c) => c.end).reduce((a, b) => (a > b ? a : b)),
      isPhaseParent: true,
      collapsed,
    };
    rows.push({ task: phaseRow, isPhaseParent: true });
    if (!collapsed) {
      children.forEach((c) => rows.push({ task: c, isPhaseParent: false }));
    }
  });
  return rows;
}

function toGanttTasks(rows) {
  const visibleIds = new Set(rows.map((r) => r.task.id));
  const taskById = {};
  tasks.forEach((t) => (taskById[t.id] = t));

  return rows.map(({ task: t, isPhaseParent }) => {
    if (isPhaseParent) {
      return {
        id: t.id,
        name: (t.collapsed ? "▶ " : "▼ ") + t.name,
        start: t.start,
        end: addDays(t.end, 1),
        progress: 0,
        dependencies: "",
        custom_class: `phase-${phaseNumber(t.phase)} phase-parent`,
      };
    }
    // If a dependency belongs to a currently-collapsed phase, point the
    // arrow at that phase's summary bar instead of a hidden task.
    const deps = (t.dependencies || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((depId) => {
        if (visibleIds.has(depId)) return depId;
        const depTask = taskById[depId];
        return depTask ? phaseParentId(depTask.phase) : null;
      })
      .filter(Boolean)
      .join(",");
    return {
      id: t.id,
      name: t.type === "Milestone" && !t.name.startsWith("◆") ? "◆ " + t.name : t.name,
      start: t.start,
      end: addDays(t.end, 1),
      progress: t.progress || 0,
      dependencies: deps,
      custom_class:
        `phase-${phaseNumber(t.phase)}` + (t.type === "Milestone" ? " milestone" : ""),
    };
  });
}

function togglePhase(phaseLabel) {
  if (collapsedPhases.has(phaseLabel)) {
    collapsedPhases.delete(phaseLabel);
  } else {
    collapsedPhases.add(phaseLabel);
  }
  localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...collapsedPhases]));
  renderGantt();
}

function renderGantt() {
  const rows = buildRenderRows();

  // Frappe Gantt attaches its drag/click listeners directly to the SVG node
  // and never removes them, so reusing the same node across renders piles up
  // duplicate handlers that fight each other. Discarding and recreating the
  // node each time lets the old listeners get garbage-collected with it.
  const target = el("ganttTarget");
  target.innerHTML = "";
  gantt = new Gantt(target, toGanttTasks(rows), {
    view_mode: currentViewMode,
    date_format: "YYYY-MM-DD",
    header_height: HEADER_HEIGHT,
    bar_height: BAR_HEIGHT,
    padding: BAR_PADDING,
    custom_popup_html: () => "", // we use our own modal instead of the built-in popup
    on_date_change: (task, start, end) => {
      if (task.id.startsWith(PHASE_PREFIX)) {
        showToast("Phase bars are calculated from their tasks — drag the tasks inside instead.", true);
        setTimeout(renderGantt, 0);
        return;
      }
      if (!getConfig()) {
        showToast("Connect GitHub to drag and reschedule tasks.", true);
        // Defer the re-render: this callback runs inside the library's own
        // mouseup handler, and tearing down the SVG synchronously here
        // leaves that handler operating on detached nodes.
        setTimeout(renderGantt, 0);
        return;
      }
      const t = tasks.find((x) => x.id === task.id);
      if (!t) return;
      t.start = formatDate(start);
      t.end = addDays(formatDate(end), -1); // library's end is exclusive; ours is inclusive
      setDirty(true);
    },
    on_progress_change: (task, progress) => {
      if (task.id.startsWith(PHASE_PREFIX)) {
        setTimeout(renderGantt, 0);
        return;
      }
      if (!getConfig()) {
        showToast("Connect GitHub to update progress.", true);
        setTimeout(renderGantt, 0);
        return;
      }
      const t = tasks.find((x) => x.id === task.id);
      if (!t) return;
      t.progress = progress;
      setDirty(true);
    },
  });

  renderNameColumn(rows);
}

function renderNameColumn(rows) {
  const body = el("nameColBody");
  body.innerHTML = "";
  body.style.height = `${rows.length * ROW_HEIGHT}px`;
  rows.forEach((r, i) => {
    const div = document.createElement("div");
    const isEditable = !!getConfig();
    div.style.top = `${i * ROW_HEIGHT}px`;
    div.style.height = `${ROW_HEIGHT}px`;
    if (r.isPhaseParent) {
      div.className = "name-row phase-row";
      const arrow = r.task.collapsed ? "▶" : "▼";
      div.innerHTML = `<span class="toggle">${arrow}</span><span>${escapeHtml(r.task.name)}</span>`;
      div.title = r.task.name;
      div.addEventListener("click", () => togglePhase(r.task.phase));
    } else {
      div.className = "name-row";
      div.innerHTML = `<span class="indent"></span><span>${escapeHtml(r.task.name)}</span>`;
      div.title = isEditable ? r.task.name : `${r.task.name} (connect GitHub to edit)`;
      div.addEventListener("click", () => openEditModal(r.task.id));
    }
    body.appendChild(div);
  });
}

// Frappe Gantt only fires its own click callback on double-click (to avoid
// misfiring after a drag). We want single-click-to-edit like Trello, so we
// track mousedown/mouseup ourselves and open the modal only when the pointer
// barely moved and released quickly — otherwise it was a drag/resize.
function attachClickToEdit() {
  // Bind on #ganttTarget, which is never replaced, instead of the SVG (or
  // Frappe's own wrapper div inside it), which renderGantt() discards and
  // recreates on every render.
  const svg = el("ganttTarget");
  let downPos = null;
  let downId = null;

  svg.addEventListener("mousedown", (e) => {
    const wrapper = e.target.closest(".bar-wrapper");
    if (!wrapper) {
      downPos = null;
      downId = null;
      return;
    }
    downPos = { x: e.clientX, y: e.clientY, t: Date.now() };
    downId = wrapper.getAttribute("data-id");
  });

  svg.addEventListener("mouseup", (e) => {
    if (!downPos || !downId) return;
    const dx = Math.abs(e.clientX - downPos.x);
    const dy = Math.abs(e.clientY - downPos.y);
    const dt = Date.now() - downPos.t;
    const id = downId;
    downPos = null;
    downId = null;
    if (dx < 5 && dy < 5 && dt < 500) {
      if (id.startsWith(PHASE_PREFIX)) {
        togglePhase(id.slice(PHASE_PREFIX.length));
      } else {
        openEditModal(id);
      }
    }
  });
}

function formatDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/* ---------- Edit modal ---------- */

const MODAL_FIELD_IDS = ["f_name", "f_phase", "f_start", "f_end", "f_type", "f_status", "f_owner", "f_progress", "f_deps", "f_notes"];

function setModalEditable(isEditable) {
  MODAL_FIELD_IDS.forEach((id) => (el(id).disabled = !isEditable));
  el("deleteBtn").classList.toggle("hidden", !isEditable);
  el("saveTaskBtn").classList.toggle("hidden", !isEditable);
}

function openEditModal(taskId) {
  editingTaskId = taskId;
  const t = tasks.find((x) => x.id === taskId);
  if (!t) return;
  const isEditable = !!getConfig();
  el("modalTitle").textContent = isEditable ? `Edit task — ${t.id}` : `${t.id} (connect GitHub to edit)`;
  el("f_name").value = t.name.replace(/^◆\s*/, "");
  el("f_phase").value = t.phase;
  el("f_start").value = t.start;
  el("f_end").value = t.end;
  el("f_type").value = t.type;
  el("f_status").value = t.status;
  el("f_owner").value = t.owner || "";
  el("f_progress").value = t.progress || 0;
  el("f_deps").value = t.dependencies || "";
  el("f_notes").value = t.notes || "";
  setModalEditable(isEditable);
  el("modalError").classList.add("hidden");
  el("modalOverlay").classList.remove("hidden");
}

function openNewTaskModal() {
  editingTaskId = null;
  el("modalTitle").textContent = "Add task";
  el("f_name").value = "";
  el("f_phase").value = "Phase 1 - Initiation & Planning";
  const today = formatDate(new Date());
  el("f_start").value = today;
  el("f_end").value = today;
  el("f_type").value = "Task";
  el("f_status").value = "Not Started";
  el("f_owner").value = "";
  el("f_progress").value = 0;
  el("f_deps").value = "";
  el("f_notes").value = "";
  setModalEditable(true);
  el("deleteBtn").classList.add("hidden");
  el("modalError").classList.add("hidden");
  el("modalOverlay").classList.remove("hidden");
}

function closeEditModal() {
  el("modalOverlay").classList.add("hidden");
}

function slugify(name) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 30) +
    "_" +
    Date.now().toString(36)
  );
}

function saveTaskFromModal() {
  const name = el("f_name").value.trim();
  const start = el("f_start").value;
  const end = el("f_end").value;
  const errBox = el("modalError");

  if (!name) return showModalError("Task name is required.");
  if (!start || !end) return showModalError("Start and end dates are required.");
  if (end < start) return showModalError("End date must be on or after the start date.");

  const data = {
    id: editingTaskId || slugify(name),
    name,
    phase: el("f_phase").value,
    start,
    end,
    type: el("f_type").value,
    status: el("f_status").value,
    owner: el("f_owner").value.trim(),
    progress: Number(el("f_progress").value) || 0,
    dependencies: el("f_deps").value.trim(),
    notes: el("f_notes").value.trim(),
  };

  if (editingTaskId) {
    const idx = tasks.findIndex((t) => t.id === editingTaskId);
    tasks[idx] = { ...tasks[idx], ...data };
  } else {
    tasks.push(data);
  }

  setDirty(true);
  closeEditModal();
  renderGantt();
}

function showModalError(msg) {
  const box = el("modalError");
  box.textContent = msg;
  box.classList.remove("hidden");
}

function deleteTask() {
  if (!editingTaskId) return;
  tasks = tasks.filter((t) => t.id !== editingTaskId);
  // Strip the deleted task from any dependency lists so the chart doesn't
  // try to draw an arrow to a task that no longer exists.
  tasks.forEach((t) => {
    if (!t.dependencies) return;
    t.dependencies = t.dependencies
      .split(",")
      .map((s) => s.trim())
      .filter((id) => id && id !== editingTaskId)
      .join(",");
  });
  setDirty(true);
  closeEditModal();
  renderGantt();
}

/* ---------- GitHub connect modal ---------- */

function openTokenModal() {
  const cfg = getConfig() || {};
  el("t_owner").value = cfg.owner || "";
  el("t_repo").value = cfg.repo || "";
  el("t_branch").value = cfg.branch || "main";
  el("t_token").value = "";
  el("tokenError").classList.add("hidden");
  el("tokenOverlay").classList.remove("hidden");
}

function closeTokenModal() {
  el("tokenOverlay").classList.add("hidden");
}

async function connectToken() {
  const owner = el("t_owner").value.trim();
  const repo = el("t_repo").value.trim();
  const branch = el("t_branch").value.trim() || "main";
  const token = el("t_token").value.trim();
  const errBox = el("tokenError");

  if (!owner || !repo || !token) {
    errBox.textContent = "Owner, repo, and token are all required.";
    errBox.classList.remove("hidden");
    return;
  }

  const cfg = { owner, repo, branch, token };
  try {
    const res = await apiRequest(cfg, "GET");
    if (!res.ok) {
      errBox.textContent = `GitHub rejected this (status ${res.status}). Check the token's repo access and the owner/repo/branch names.`;
      errBox.classList.remove("hidden");
      return;
    }
    setConfig(cfg);
    closeTokenModal();
    el("addTaskBtn").disabled = false;
    await loadTasks();
    renderGantt();
    showToast("Connected — you can now edit and save.");
  } catch (e) {
    errBox.textContent = "Network error reaching the GitHub API. Check your connection and try again.";
    errBox.classList.remove("hidden");
  }
}

function disconnectToken() {
  clearConfig();
  closeTokenModal();
  el("addTaskBtn").disabled = true;
  loadTasks().then(() => {
    renderGantt();
    showToast("Disconnected. Now viewing the read-only published snapshot.");
  });
}

/* ---------- Save to GitHub ---------- */

async function saveChanges() {
  const cfg = getConfig();
  if (!cfg) return;

  const content = b64EncodeUnicode(JSON.stringify(tasks, null, 2));
  try {
    const res = await apiRequest(cfg, "PUT", {
      message: `Update Gantt data (${new Date().toISOString()})`,
      content,
      sha: fileSha,
      branch: cfg.branch,
    });

    if (res.status === 409 || res.status === 422) {
      showToast("Someone else saved changes since you loaded this page. Reloading the latest version — please redo your edit.", true);
      await loadTasks();
      renderGantt();
      return;
    }
    if (res.status === 401 || res.status === 403) {
      showToast("GitHub rejected the save — your token may be invalid or lack write access.", true);
      return;
    }
    if (!res.ok) {
      throw new Error(`GitHub API returned ${res.status}`);
    }

    const json = await res.json();
    fileSha = json.content.sha;
    setDirty(false);
    showToast("Saved to GitHub. Teammates will see it after the next Pages build (usually under a minute).");
  } catch (e) {
    showToast("Save failed — check your connection and try again.", true);
  }
}

/* ---------- Wiring ---------- */

function wireUp() {
  document.querySelectorAll(".view-modes button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".view-modes button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentViewMode = btn.dataset.mode;
      if (gantt) gantt.change_view_mode(currentViewMode);
    });
  });

  el("addTaskBtn").addEventListener("click", openNewTaskModal);
  el("saveBtn").addEventListener("click", saveChanges);
  el("connectBtn").addEventListener("click", openTokenModal);

  el("cancelBtn").addEventListener("click", closeEditModal);
  el("saveTaskBtn").addEventListener("click", saveTaskFromModal);
  el("deleteBtn").addEventListener("click", deleteTask);

  el("tokenCancelBtn").addEventListener("click", closeTokenModal);
  el("tokenSaveBtn").addEventListener("click", connectToken);
  el("clearTokenBtn").addEventListener("click", disconnectToken);

  window.addEventListener("beforeunload", (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}

(async function init() {
  wireUp();
  attachClickToEdit();
  const cfg = getConfig();
  el("addTaskBtn").disabled = !cfg;
  el("connectBtn").textContent = cfg ? "Manage GitHub connection" : "Connect GitHub to edit";
  await loadTasks();
  renderGantt();
})();

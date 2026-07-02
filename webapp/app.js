/* IT Product Deployment — interactive Gantt chart.
   Reads/writes webapp/projects.json directly via the GitHub Contents API so
   changes made by any teammate (with a connected token) land as real commits.
   Without a token, the app is read-only and shows the last published snapshot.
*/

const STORAGE_KEY = "gantt_gh_config_v1";
const COLLAPSE_KEY = "gantt_collapsed_phases_v1";
const PROJECT_KEY = "gantt_current_project_v1";
const LANG_KEY = "gantt_lang_v1";
const DATA_PATH = "webapp/projects.json"; // path relative to repo root
const PHASE_PREFIX = "__phase__";

// Row geometry fed explicitly into `new Gantt()` below so the name column
// can position rows by formula instead of measuring the rendered SVG.
const HEADER_HEIGHT = 50;
const BAR_HEIGHT = 24;
const BAR_PADDING = 20;
const ROW_HEIGHT = BAR_HEIGHT + BAR_PADDING; // taller rows give text room to wrap instead of truncating

let projects = [];
let currentProjectId = null;
let tasks = []; // always the same array reference as getCurrentProject().tasks
let gantt = null;
let currentViewMode = "Month";
let fileSha = null; // sha of projects.json as last fetched via the API (null when read-only)
let dirty = false;
let editingTaskId = null; // task currently open in the edit modal, or null for "new task"
let collapsedPhases = new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || "[]"));
let currentLang = localStorage.getItem(LANG_KEY) || "en";

function getCurrentProject() {
  return projects.find((p) => p.id === currentProjectId) || null;
}

const el = (id) => document.getElementById(id);

const I18N = {
  en: {
    app_title: "Gantt Chart",
    view_day: "Day",
    view_week: "Week",
    view_month: "Month",
    view_year: "Year",
    btn_add_task: "+ Add task",
    btn_add_phase: "+ Phase",
    btn_new_project: "+ Project",
    btn_save_changes: "Save changes",
    btn_connect: "Connect GitHub to edit",
    btn_manage_connection: "Manage GitHub connection",
    status_readonly: "Read-only (viewing published snapshot)",
    status_dirty: "Unsaved changes",
    status_connected: "Connected — editable",
    modal_edit_title: "Edit task",
    modal_add_title: "Add task",
    modal_edit_title_dynamic: "Edit task — {id}",
    modal_readonly_title_dynamic: "{id} (connect GitHub to edit)",
    field_task_name: "Task name",
    field_phase: "Phase",
    field_start_date: "Start date",
    field_end_date: "End date",
    field_type: "Type",
    field_status: "Status",
    field_owner: "Owner",
    field_progress: "Progress (%)",
    field_dependencies: "Dependencies (comma-separated task IDs)",
    field_notes: "Notes",
    type_task: "Task",
    type_milestone: "Milestone",
    status_not_started: "Not Started",
    status_in_progress: "In Progress",
    status_blocked: "Blocked",
    status_in_review: "In Review",
    status_done: "Done",
    btn_delete: "Delete",
    btn_cancel: "Cancel",
    btn_save_task: "Save task",
    err_name_required: "Task name is required.",
    err_dates_required: "Start and end dates are required.",
    err_end_before_start: "End date must be on or after the start date.",
    token_modal_title: "Connect to GitHub to edit",
    token_modal_help: "Paste a GitHub personal access token with <strong>Contents: Read and write</strong> access to this repository. It's stored only in your browser's local storage and sent directly to <code>api.github.com</code> — never to any other server.",
    field_repo_owner: "Repository owner/org",
    field_repo_name: "Repository name",
    field_branch: "Branch",
    field_token: "Personal access token",
    btn_disconnect: "Disconnect",
    btn_connect_short: "Connect",
    err_owner_repo_token_required: "Owner, repo, and token are all required.",
    err_github_rejected: "GitHub rejected this (status {status}). Check the token's repo access and the owner/repo/branch names.",
    err_network: "Network error reaching the GitHub API. Check your connection and try again.",
    toast_token_rejected: "Saved token was rejected by GitHub — please reconnect.",
    toast_api_unreachable: "Could not reach GitHub API, falling back to published snapshot.",
    toast_save_conflict: "Someone else saved changes since you loaded this page. Reloading the latest version — please redo your edit.",
    toast_save_rejected: "GitHub rejected the save — your token may be invalid or lack write access.",
    toast_saved: "Saved to GitHub. Teammates will see it after the next Pages build (usually under a minute).",
    toast_save_failed: "Save failed — check your connection and try again.",
    toast_connected: "Connected — you can now edit and save.",
    toast_disconnected: "Disconnected. Now viewing the read-only published snapshot.",
    toast_drag_readonly: "Connect GitHub to drag and reschedule tasks.",
    toast_progress_readonly: "Connect GitHub to update progress.",
    toast_phase_bar_readonly: "Phase bars are calculated from their tasks — drag the tasks inside instead.",
    prompt_new_project_name: "New project name:",
    empty_project: "This project has no tasks yet. Click \"+ Add task\" to get started.",
    overdue_days_title: "{days} day(s) overdue",
    col_task: "Task",
    col_owner: "Owner",
    col_overdue: "Overdue",
    default_phase_name: "Phase 1",
    prompt_rename_project_name: "Rename project to:",
    confirm_delete_project: "Delete project \"{name}\" and all its tasks? This cannot be undone.",
    toast_cannot_delete_last_project: "Can't delete the only project.",
    prompt_add_phase_name: "New phase name:",
    prompt_rename_phase_name: "Rename phase to:",
    err_phase_duplicate: "A phase with that name already exists.",
    confirm_delete_phase_with_tasks: "Delete phase \"{name}\" and its {count} task(s)? This cannot be undone.",
    confirm_delete_phase_empty: "Delete phase \"{name}\"?",
    title_rename_project: "Rename project",
    title_delete_project: "Delete project",
    title_add_phase: "Add phase",
    title_rename_phase: "Rename phase",
    title_delete_phase: "Delete phase",
    err_deps_not_done: "Can't mark this Done — dependency not finished yet: {names}",
    toast_deps_not_done: "Can't reach 100% — a dependency isn't marked Done yet.",
    toast_dep_added: "Dependency added.",
    toast_dep_exists: "That dependency already exists.",
    toast_dep_cycle: "That would create a circular dependency.",
    toast_dep_connect_readonly: "Connect GitHub to link dependencies.",
    dep_connector_hint: "Drag to another task to add a dependency",
  },
  ru: {
    app_title: "Диаграмма Ганта",
    view_day: "День",
    view_week: "Неделя",
    view_month: "Месяц",
    view_year: "Год",
    btn_add_task: "+ Задача",
    btn_add_phase: "+ Этап",
    btn_new_project: "+ Проект",
    btn_save_changes: "Сохранить",
    btn_connect: "Подключить GitHub для редактирования",
    btn_manage_connection: "Управление подключением GitHub",
    status_readonly: "Только просмотр (опубликованная версия)",
    status_dirty: "Есть несохранённые изменения",
    status_connected: "Подключено — можно редактировать",
    modal_edit_title: "Редактировать задачу",
    modal_add_title: "Новая задача",
    modal_edit_title_dynamic: "Редактировать задачу — {id}",
    modal_readonly_title_dynamic: "{id} (подключите GitHub для редактирования)",
    field_task_name: "Название задачи",
    field_phase: "Этап",
    field_start_date: "Дата начала",
    field_end_date: "Дата окончания",
    field_type: "Тип",
    field_status: "Статус",
    field_owner: "Ответственный",
    field_progress: "Прогресс (%)",
    field_dependencies: "Зависимости (ID задач через запятую)",
    field_notes: "Заметки",
    type_task: "Задача",
    type_milestone: "Веха",
    status_not_started: "Не начато",
    status_in_progress: "В процессе",
    status_blocked: "Заблокировано",
    status_in_review: "На проверке",
    status_done: "Готово",
    btn_delete: "Удалить",
    btn_cancel: "Отмена",
    btn_save_task: "Сохранить задачу",
    err_name_required: "Введите название задачи.",
    err_dates_required: "Укажите дату начала и окончания.",
    err_end_before_start: "Дата окончания не может быть раньше даты начала.",
    token_modal_title: "Подключение к GitHub для редактирования",
    token_modal_help: "Вставьте персональный токен доступа GitHub с правом <strong>Contents: Read and write</strong> для этого репозитория. Токен хранится только в локальном хранилище вашего браузера и отправляется напрямую на <code>api.github.com</code> — никогда на другой сервер.",
    field_repo_owner: "Владелец репозитория/организация",
    field_repo_name: "Название репозитория",
    field_branch: "Ветка",
    field_token: "Персональный токен доступа",
    btn_disconnect: "Отключить",
    btn_connect_short: "Подключить",
    err_owner_repo_token_required: "Заполните владельца, репозиторий и токен.",
    err_github_rejected: "GitHub отклонил запрос (статус {status}). Проверьте права токена и правильность владельца/репозитория/ветки.",
    err_network: "Ошибка сети при обращении к GitHub API. Проверьте подключение и попробуйте снова.",
    toast_token_rejected: "Сохранённый токен отклонён GitHub — подключитесь заново.",
    toast_api_unreachable: "Не удалось связаться с GitHub API, показана опубликованная версия.",
    toast_save_conflict: "Кто-то другой уже сохранил изменения. Загружаем последнюю версию — повторите ваше изменение.",
    toast_save_rejected: "GitHub отклонил сохранение — токен недействителен или не имеет прав на запись.",
    toast_saved: "Сохранено на GitHub. Коллеги увидят изменения после следующей публикации (обычно менее минуты).",
    toast_save_failed: "Не удалось сохранить — проверьте подключение и попробуйте снова.",
    toast_connected: "Подключено — теперь можно редактировать и сохранять.",
    toast_disconnected: "Отключено. Показана версия только для просмотра.",
    toast_drag_readonly: "Подключите GitHub, чтобы перетаскивать и менять сроки задач.",
    toast_progress_readonly: "Подключите GitHub, чтобы обновлять прогресс.",
    toast_phase_bar_readonly: "Полосы этапов рассчитываются по их задачам — перетаскивайте задачи внутри этапа.",
    prompt_new_project_name: "Название нового проекта:",
    empty_project: "В этом проекте пока нет задач. Нажмите «+ Задача», чтобы начать.",
    overdue_days_title: "Просрочено на {days} дн.",
    col_task: "Задача",
    col_owner: "Исполнитель",
    col_overdue: "Просроченность",
    default_phase_name: "Этап 1",
    prompt_rename_project_name: "Переименовать проект в:",
    confirm_delete_project: "Удалить проект «{name}» и все его задачи? Это действие необратимо.",
    toast_cannot_delete_last_project: "Нельзя удалить единственный проект.",
    prompt_add_phase_name: "Название нового этапа:",
    prompt_rename_phase_name: "Переименовать этап в:",
    err_phase_duplicate: "Этап с таким названием уже существует.",
    confirm_delete_phase_with_tasks: "Удалить этап «{name}» и его задачи ({count})? Это действие необратимо.",
    confirm_delete_phase_empty: "Удалить этап «{name}»?",
    title_rename_project: "Переименовать проект",
    title_delete_project: "Удалить проект",
    title_add_phase: "Добавить этап",
    title_rename_phase: "Переименовать этап",
    title_delete_phase: "Удалить этап",
    err_deps_not_done: "Нельзя завершить: не выполнена зависимая задача: {names}",
    toast_deps_not_done: "Нельзя дойти до 100% — зависимая задача ещё не завершена.",
    toast_dep_added: "Зависимость добавлена.",
    toast_dep_exists: "Такая зависимость уже есть.",
    toast_dep_cycle: "Это создаст циклическую зависимость.",
    toast_dep_connect_readonly: "Подключите GitHub, чтобы связывать зависимости.",
    dep_connector_hint: "Перетащите на другую задачу, чтобы добавить зависимость",
  },
};

function tr(key, vars) {
  const dict = I18N[currentLang] || I18N.en;
  let str = dict[key] || I18N.en[key] || key;
  if (vars) {
    Object.keys(vars).forEach((k) => {
      str = str.replace(`{${k}}`, vars[k]);
    });
  }
  return str;
}

function applyStaticTranslations() {
  document.querySelectorAll("[data-i18n]").forEach((elm) => {
    elm.textContent = tr(elm.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-html]").forEach((elm) => {
    elm.innerHTML = tr(elm.dataset.i18nHtml);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((elm) => {
    elm.placeholder = tr(elm.dataset.i18nPlaceholder);
  });
  el("langToggle").textContent = currentLang === "en" ? "RU" : "EN";
  syncTopbarHeight();
}

// The topbar can wrap to two lines (narrow viewport, or longer Russian
// labels), so its height isn't a fixed constant — the frozen header row
// needs to stick right below it, not at a hardcoded offset, or the two
// sticky elements would overlap once the page itself scrolls.
function syncTopbarHeight() {
  const topbar = document.querySelector(".topbar");
  if (!topbar) return;
  document.documentElement.style.setProperty("--topbar-height", `${topbar.offsetHeight}px`);
}

window.addEventListener("resize", syncTopbarHeight);

function setLang(lang) {
  currentLang = lang;
  localStorage.setItem(LANG_KEY, lang);
  applyStaticTranslations();
  setDirty(dirty); // refresh the status pill text in the new language
  renderProjectSelector();
  renderGantt();
}

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
    pill.textContent = tr("status_readonly");
    pill.className = "status-pill status-readonly";
  } else if (dirty) {
    pill.textContent = tr("status_dirty");
    pill.className = "status-pill status-dirty";
  } else {
    pill.textContent = tr("status_connected");
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

async function loadProjects() {
  const cfg = getConfig();
  if (cfg && cfg.token) {
    try {
      const res = await apiRequest(cfg, "GET");
      if (res.status === 401 || res.status === 403) {
        showToast(tr("toast_token_rejected"), true);
        clearConfig();
      } else if (!res.ok) {
        throw new Error(`GitHub API returned ${res.status}`);
      } else {
        const json = await res.json();
        fileSha = json.sha;
        projects = JSON.parse(b64DecodeUnicode(json.content)).projects || [];
        setDirty(false);
        selectInitialProject();
        return;
      }
    } catch (e) {
      showToast(tr("toast_api_unreachable"), true);
    }
  }
  // Read-only fallback: whatever was last published to GitHub Pages.
  const res = await fetch("./projects.json");
  const data = await res.json();
  projects = data.projects || [];
  fileSha = null;
  setDirty(false);
  selectInitialProject();
}

function selectInitialProject() {
  const saved = localStorage.getItem(PROJECT_KEY);
  if (saved && projects.some((p) => p.id === saved)) {
    currentProjectId = saved;
  } else {
    currentProjectId = projects.length ? projects[0].id : null;
  }
  tasks = getCurrentProject() ? getCurrentProject().tasks : [];
}

function switchProject(id) {
  const cur = getCurrentProject();
  if (cur) cur.tasks = tasks; // write back in-memory edits before switching away
  currentProjectId = id;
  localStorage.setItem(PROJECT_KEY, id);
  const proj = getCurrentProject();
  tasks = proj ? proj.tasks : [];
  renderProjectSelector();
  renderGantt();
}

function addProject() {
  const name = (prompt(tr("prompt_new_project_name")) || "").trim();
  if (!name) return;
  const cur = getCurrentProject();
  if (cur) cur.tasks = tasks;
  const id = slugify(name);
  projects.push({ id, name, phases: [tr("default_phase_name")], tasks: [] });
  currentProjectId = id;
  localStorage.setItem(PROJECT_KEY, id);
  tasks = getCurrentProject().tasks;
  setDirty(true);
  renderProjectSelector();
  renderGantt();
}

function renameProject() {
  const proj = getCurrentProject();
  if (!proj) return;
  const newName = (prompt(tr("prompt_rename_project_name"), proj.name) || "").trim();
  if (!newName || newName === proj.name) return;
  proj.name = newName;
  setDirty(true);
  renderProjectSelector();
}

function deleteProject() {
  const proj = getCurrentProject();
  if (!proj) return;
  if (projects.length <= 1) {
    showToast(tr("toast_cannot_delete_last_project"), true);
    return;
  }
  if (!confirm(tr("confirm_delete_project", { name: proj.name }))) return;
  projects = projects.filter((p) => p.id !== proj.id);
  currentProjectId = projects[0].id;
  localStorage.setItem(PROJECT_KEY, currentProjectId);
  tasks = getCurrentProject().tasks;
  setDirty(true);
  renderProjectSelector();
  renderGantt();
}

function addPhase() {
  const proj = getCurrentProject();
  if (!proj) return;
  const name = (prompt(tr("prompt_add_phase_name")) || "").trim();
  if (!name) return;
  if (!Array.isArray(proj.phases)) proj.phases = getPhaseList();
  if (proj.phases.includes(name)) {
    showToast(tr("err_phase_duplicate"), true);
    return;
  }
  proj.phases.push(name);
  setDirty(true);
  renderGantt();
}

function renamePhase(oldName) {
  const proj = getCurrentProject();
  if (!proj) return;
  const newName = (prompt(tr("prompt_rename_phase_name"), oldName) || "").trim();
  if (!newName || newName === oldName) return;
  if (!Array.isArray(proj.phases)) proj.phases = getPhaseList();
  if (proj.phases.includes(newName)) {
    showToast(tr("err_phase_duplicate"), true);
    return;
  }
  const idx = proj.phases.indexOf(oldName);
  if (idx !== -1) proj.phases[idx] = newName;
  tasks.forEach((t) => {
    if (t.phase === oldName) t.phase = newName;
  });
  if (collapsedPhases.has(oldName)) {
    collapsedPhases.delete(oldName);
    collapsedPhases.add(newName);
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...collapsedPhases]));
  }
  setDirty(true);
  renderGantt();
}

function deletePhase(name) {
  const proj = getCurrentProject();
  if (!proj) return;
  const affected = tasks.filter((t) => t.phase === name);
  const message = affected.length
    ? tr("confirm_delete_phase_with_tasks", { name, count: affected.length })
    : tr("confirm_delete_phase_empty", { name });
  if (!confirm(message)) return;
  const affectedIds = new Set(affected.map((t) => t.id));
  tasks = tasks.filter((t) => t.phase !== name);
  tasks.forEach((t) => {
    if (!t.dependencies) return;
    t.dependencies = t.dependencies
      .split(",")
      .map((s) => s.trim())
      .filter((id) => id && !affectedIds.has(id))
      .join(",");
  });
  if (!Array.isArray(proj.phases)) proj.phases = getPhaseList();
  proj.phases = proj.phases.filter((p) => p !== name);
  collapsedPhases.delete(name);
  localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...collapsedPhases]));
  setDirty(true);
  renderGantt();
}

function renderProjectSelector() {
  const sel = el("projectSelect");
  sel.innerHTML = "";
  projects.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    if (p.id === currentProjectId) opt.selected = true;
    sel.appendChild(opt);
  });
  const proj = getCurrentProject();
  document.title = proj ? `${proj.name} — Gantt` : "Gantt";
  el("pageTitle").textContent = proj ? proj.name : tr("app_title");
}

// Phases can now be freely renamed/added, so we can't rely on parsing
// "Phase N" out of the name for a colour — cycle through the palette by
// the phase's position in the project's own phase list instead.
function phaseColorClass(phaseLabel) {
  const proj = getCurrentProject();
  const phases = (proj && proj.phases) || [];
  const idx = phases.indexOf(phaseLabel);
  const n = idx === -1 ? 0 : (idx % 7) + 1;
  return `phase-${n}`;
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

// Phases are an explicit, ordered, per-project list (project.phases) so a
// phase can exist with zero tasks (freshly added, or about to be
// deleted). Older/foreign data without a phases list falls back to
// deriving one from whatever `phase` values the tasks already have.
function getPhaseList() {
  const proj = getCurrentProject();
  if (proj && Array.isArray(proj.phases) && proj.phases.length) return proj.phases;
  const seen = [];
  tasks.forEach((t) => {
    if (t.phase && !seen.includes(t.phase)) seen.push(t.phase);
  });
  return seen;
}

// Each phase becomes a collapsible synthetic parent row spanning the
// min/max dates of its children (or today, if it has none yet).
function buildRenderRows() {
  const phaseList = getPhaseList();
  const phaseGroups = {};
  phaseList.forEach((p) => (phaseGroups[p] = []));
  tasks.forEach((t) => {
    if (!phaseGroups[t.phase]) phaseGroups[t.phase] = []; // defensive: task references a phase no longer in the list
    phaseGroups[t.phase].push(t);
  });
  const allPhaseNames = phaseList.concat(Object.keys(phaseGroups).filter((p) => !phaseList.includes(p)));

  const rows = [];
  allPhaseNames.forEach((phaseLabel) => {
    const children = phaseGroups[phaseLabel] || [];
    const collapsed = collapsedPhases.has(phaseLabel);
    const today = formatDate(new Date());
    const phaseRow = {
      id: phaseParentId(phaseLabel),
      name: phaseLabel,
      phase: phaseLabel,
      start: children.length ? children.map((c) => c.start).reduce((a, b) => (a < b ? a : b)) : today,
      end: children.length ? children.map((c) => c.end).reduce((a, b) => (a > b ? a : b)) : today,
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
        custom_class: `${phaseColorClass(t.phase)} phase-parent`,
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
        phaseColorClass(t.phase) +
        (t.type === "Milestone" ? " milestone" : "") +
        (daysOverdue(t) ? " overdue" : ""),
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
  const target = el("ganttTarget");

  // Frappe Gantt can't compute a date axis from zero tasks (throws inside
  // its own setup_dates), which happens for any brand-new empty project —
  // render our own empty state instead of calling into it.
  if (rows.length === 0) {
    gantt = null;
    target.innerHTML = "";
    el("nameColBody").innerHTML = "";
    el("nameColBody").style.height = "0";
    el("ganttHeaderViewport").innerHTML = "";
    target.innerHTML = `<div class="empty-state">${escapeHtml(tr("empty_project"))}</div>`;
    return;
  }

  // Frappe Gantt attaches its drag/click listeners directly to the SVG node
  // and never removes them, so reusing the same node across renders piles up
  // duplicate handlers that fight each other. Discarding and recreating the
  // node each time lets the old listeners get garbage-collected with it.
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
        showToast(tr("toast_phase_bar_readonly"), true);
        setTimeout(renderGantt, 0);
        return;
      }
      if (!getConfig()) {
        showToast(tr("toast_drag_readonly"), true);
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
        showToast(tr("toast_progress_readonly"), true);
        setTimeout(renderGantt, 0);
        return;
      }
      const t = tasks.find((x) => x.id === task.id);
      if (!t) return;
      if (progress >= 100 && getIncompleteDependencyNames(t.dependencies, t.id).length) {
        showToast(tr("toast_deps_not_done"), true);
        setTimeout(renderGantt, 0);
        return;
      }
      t.progress = progress;
      setDirty(true);
    },
  });

  renderNameColumn(rows);
  syncFrozenHeader();
  renderDependencyConnectors();
}

// The frozen header row shows a cloned, cropped copy of the chart's own
// SVG (so it always matches exactly) and mirrors horizontal scroll
// bidirectionally with the real body — cheap at this chart's size (a few
// dozen rows), and avoids the unreliable SVG position:sticky approach.
function syncFrozenHeader() {
  const bodyScroller = document.querySelector("#ganttTarget > .gantt-container");
  const headerViewport = el("ganttHeaderViewport");
  headerViewport.innerHTML = "";
  if (!bodyScroller) return;

  const svg = bodyScroller.querySelector("svg");
  if (!svg) return;
  const clone = svg.cloneNode(true);
  headerViewport.appendChild(clone);
  colorizeHeaderClone(clone);

  let syncing = false;
  bodyScroller.addEventListener("scroll", () => {
    if (syncing) return;
    syncing = true;
    headerViewport.scrollLeft = bodyScroller.scrollLeft;
    syncing = false;
  });
  headerViewport.addEventListener("scroll", () => {
    if (syncing) return;
    syncing = true;
    bodyScroller.scrollLeft = headerViewport.scrollLeft;
    syncing = false;
  });
}

const MONTH_CHIP_COLORS = ["#eef1fb", "#e6f5f0"];
const SVG_NS = "http://www.w3.org/2000/svg";

// Only touches the header clone (never the real, interactive body) so
// there's no risk of interfering with drag/click handling.
function colorizeHeaderClone(svg) {
  Array.from(svg.querySelectorAll(".lower-text")).forEach((t, i) => {
    const box = t.getBBox();
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", box.x - 4);
    rect.setAttribute("y", box.y - 3);
    rect.setAttribute("width", box.width + 8);
    rect.setAttribute("height", box.height + 6);
    rect.setAttribute("rx", 3);
    rect.setAttribute("fill", MONTH_CHIP_COLORS[i % MONTH_CHIP_COLORS.length]);
    t.parentNode.insertBefore(rect, t);
  });
  Array.from(svg.querySelectorAll(".upper-text")).forEach((t) => {
    t.setAttribute("font-weight", "700");
    t.style.fill = "#2f6fed";
  });
}

const AVATAR_COLORS = ["#2f6fed", "#4caf82", "#d7a03d", "#9b6bd7", "#d76b6b", "#4fb0c6", "#6b6b6b"];

function ownerColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function ownerCellHtml(owner) {
  const name = (owner || "").trim();
  if (!name) return `<span class="col-owner"></span>`;
  const initial = escapeHtml(name[0].toUpperCase());
  const color = ownerColor(name);
  return (
    `<span class="col-owner" title="${escapeHtml(name)}">` +
    `<span class="avatar" style="background:${color}">${initial}</span>` +
    `<span class="owner-name">${escapeHtml(name)}</span></span>`
  );
}

function overdueCellHtml(overdueDays) {
  if (!overdueDays) return `<span class="col-overdue"></span>`;
  const label = `${overdueDays}d`;
  const titleText = escapeHtml(tr("overdue_days_title", { days: overdueDays }));
  return `<span class="col-overdue"><span class="overdue-badge" title="${titleText}">${label}</span></span>`;
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
      const phaseActionsHtml = isEditable
        ? `<span class="col-owner phase-actions"><button type="button" class="icon-btn rename-phase-btn" title="${escapeHtml(tr("title_rename_phase"))}">✎</button></span>` +
          `<span class="col-overdue phase-actions"><button type="button" class="icon-btn delete-phase-btn" title="${escapeHtml(tr("title_delete_phase"))}">🗑</button></span>`
        : `<span class="col-owner"></span><span class="col-overdue"></span>`;
      div.innerHTML =
        `<span class="col-task"><span class="toggle">${arrow}</span><span class="task-label">${escapeHtml(r.task.name)}</span></span>` +
        phaseActionsHtml;
      div.title = r.task.name;
      div.addEventListener("click", () => togglePhase(r.task.phase));
      if (isEditable) {
        div.querySelector(".rename-phase-btn").addEventListener("click", (e) => {
          e.stopPropagation();
          renamePhase(r.task.phase);
        });
        div.querySelector(".delete-phase-btn").addEventListener("click", (e) => {
          e.stopPropagation();
          deletePhase(r.task.phase);
        });
      }
    } else {
      const overdue = daysOverdue(r.task);
      div.className = "name-row" + (overdue ? " overdue" : "");
      div.innerHTML =
        `<span class="col-task"><span class="indent"></span><span class="task-label">${escapeHtml(r.task.name)}</span></span>` +
        ownerCellHtml(r.task.owner) +
        overdueCellHtml(overdue);
      const baseTitle = isEditable ? r.task.name : tr("modal_readonly_title_dynamic", { id: r.task.name });
      div.title = overdue ? `${baseTitle} — ${tr("overdue_days_title", { days: overdue })}` : baseTitle;
      div.addEventListener("click", () => openEditModal(r.task.id));
    }
    body.appendChild(div);
  });
}

// Small circle at the right edge of each (non-phase) task's bar — dragging
// from it onto another task's bar adds that as a dependency. Frappe Gantt
// has no built-in support for this, so the whole interaction (the dots,
// the preview line while dragging, and drop-target detection) is ours.
// Lives in its own top-level <g>, a sibling of Frappe's bar-wrapper
// groups rather than nested inside one, so Frappe's own mousedown
// delegation (which matches ".bar-wrapper, .handle") never fires for a
// drag that starts on a connector.
function findBarWrapper(taskId) {
  return Array.from(document.querySelectorAll("#ganttTarget .bar-wrapper")).find(
    (w) => w.getAttribute("data-id") === taskId
  );
}

function renderDependencyConnectors() {
  const svg = document.querySelector("#ganttTarget > .gantt-container > svg");
  if (!svg) return;
  const layer = document.createElementNS(SVG_NS, "g");
  layer.setAttribute("class", "dep-connector-layer");
  svg.appendChild(layer);

  tasks.forEach((t) => {
    const wrapper = findBarWrapper(t.id);
    const bar = wrapper && wrapper.querySelector(".bar-group .bar");
    if (!bar) return;
    const box = bar.getBBox();
    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", box.x + box.width);
    circle.setAttribute("cy", box.y + box.height / 2);
    circle.setAttribute("r", 5);
    circle.setAttribute("class", "dep-connector");
    circle.setAttribute("data-task-id", t.id);
    const titleEl = document.createElementNS(SVG_NS, "title");
    titleEl.textContent = tr("dep_connector_hint");
    circle.appendChild(titleEl);
    layer.appendChild(circle);
  });
}

function toSvgPoint(svg, clientX, clientY) {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

function attachDependencyLinking() {
  const container = el("ganttTarget");
  let dragState = null; // { fromId, svg, previewLine }

  container.addEventListener("mousedown", (e) => {
    const connector = e.target.closest(".dep-connector");
    if (!connector) return;
    e.preventDefault();
    e.stopPropagation();
    const svg = connector.ownerSVGElement;
    const start = toSvgPoint(svg, e.clientX, e.clientY);
    const previewLine = document.createElementNS(SVG_NS, "line");
    previewLine.setAttribute("class", "dep-connector-preview");
    previewLine.setAttribute("x1", start.x);
    previewLine.setAttribute("y1", start.y);
    previewLine.setAttribute("x2", start.x);
    previewLine.setAttribute("y2", start.y);
    svg.appendChild(previewLine);
    dragState = { fromId: connector.getAttribute("data-task-id"), svg, previewLine };
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragState) return;
    const p = toSvgPoint(dragState.svg, e.clientX, e.clientY);
    dragState.previewLine.setAttribute("x2", p.x);
    dragState.previewLine.setAttribute("y2", p.y);
  });

  document.addEventListener("mouseup", (e) => {
    if (!dragState) return;
    const { fromId, previewLine } = dragState;
    dragState = null;
    previewLine.remove();

    const dropEl = document.elementFromPoint(e.clientX, e.clientY);
    const wrapper = dropEl ? dropEl.closest(".bar-wrapper") : null;
    const toId = wrapper ? wrapper.getAttribute("data-id") : null;
    if (!toId || toId === fromId || toId.startsWith(PHASE_PREFIX) || fromId.startsWith(PHASE_PREFIX)) return;
    addDependencyLink(fromId, toId);
  });
}

// Adding "toId depends on fromId" would create a cycle if fromId already
// (transitively) depends on toId — walk fromId's own dependency chain
// looking for toId.
function wouldCreateCycle(fromId, toId) {
  const visited = new Set();
  function dependsOn(taskId, targetId) {
    if (taskId === targetId) return true;
    if (visited.has(taskId)) return false;
    visited.add(taskId);
    const t = tasks.find((x) => x.id === taskId);
    if (!t || !t.dependencies) return false;
    return t.dependencies
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .some((dep) => dependsOn(dep, targetId));
  }
  return dependsOn(fromId, toId);
}

function addDependencyLink(fromId, toId) {
  if (!getConfig()) {
    showToast(tr("toast_dep_connect_readonly"), true);
    return;
  }
  const toTask = tasks.find((t) => t.id === toId);
  if (!toTask) return;
  const existing = (toTask.dependencies || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (existing.includes(fromId)) {
    showToast(tr("toast_dep_exists"), true);
    return;
  }
  if (wouldCreateCycle(fromId, toId)) {
    showToast(tr("toast_dep_cycle"), true);
    return;
  }
  existing.push(fromId);
  toTask.dependencies = existing.join(",");
  setDirty(true);
  renderGantt();
  showToast(tr("toast_dep_added"));
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

// Days past its end date for a task that isn't marked Done yet, or 0 if
// it's on time / already finished. ISO YYYY-MM-DD strings compare
// correctly with plain string comparison, so no date parsing needed.
function daysOverdue(t) {
  if (!t || t.status === "Done" || !t.end) return 0;
  const todayStr = formatDate(new Date());
  if (t.end >= todayStr) return 0;
  const diffMs = parseLocalDate(todayStr) - parseLocalDate(t.end);
  return Math.round(diffMs / 86400000);
}

// Names of dependency tasks (by ID list, comma-separated) that aren't
// marked Done yet — used to block marking a task Done, or its progress
// reaching 100%, before its prerequisites are actually finished.
function getIncompleteDependencyNames(depsString, ownId) {
  const ids = (depsString || "").split(",").map((s) => s.trim()).filter(Boolean);
  return ids
    .map((id) => tasks.find((x) => x.id === id && x.id !== ownId))
    .filter((dep) => dep && dep.status !== "Done")
    .map((dep) => dep.name);
}

/* ---------- Edit modal ---------- */

const MODAL_FIELD_IDS = ["f_name", "f_phase", "f_start", "f_end", "f_type", "f_status", "f_owner", "f_progress", "f_deps", "f_notes"];

function setModalEditable(isEditable) {
  MODAL_FIELD_IDS.forEach((id) => (el(id).disabled = !isEditable));
  el("deleteBtn").classList.toggle("hidden", !isEditable);
  el("saveTaskBtn").classList.toggle("hidden", !isEditable);
}

// The Phase field used to be a fixed 7-option list; now it reflects
// whatever this project's phases actually are, so it's rebuilt every
// time the modal opens instead of living as static HTML.
function populatePhaseSelect() {
  const sel = el("f_phase");
  sel.innerHTML = "";
  getPhaseList().forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p;
    opt.textContent = p;
    sel.appendChild(opt);
  });
}

function openEditModal(taskId) {
  editingTaskId = taskId;
  const t = tasks.find((x) => x.id === taskId);
  if (!t) return;
  const isEditable = !!getConfig();
  el("modalTitle").textContent = isEditable
    ? tr("modal_edit_title_dynamic", { id: t.id })
    : tr("modal_readonly_title_dynamic", { id: t.id });
  populatePhaseSelect();
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
  el("modalTitle").textContent = tr("modal_add_title");
  populatePhaseSelect();
  el("f_name").value = "";
  const phases = getPhaseList();
  el("f_phase").value = phases.length ? phases[0] : "";
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

  if (!name) return showModalError(tr("err_name_required"));
  if (!start || !end) return showModalError(tr("err_dates_required"));
  if (end < start) return showModalError(tr("err_end_before_start"));

  const status = el("f_status").value;
  const dependencies = el("f_deps").value.trim();
  if (status === "Done") {
    const incomplete = getIncompleteDependencyNames(dependencies, editingTaskId);
    if (incomplete.length) {
      return showModalError(tr("err_deps_not_done", { names: incomplete.join(", ") }));
    }
  }

  const data = {
    id: editingTaskId || slugify(name),
    name,
    phase: el("f_phase").value,
    start,
    end,
    type: el("f_type").value,
    status,
    owner: el("f_owner").value.trim(),
    progress: Number(el("f_progress").value) || 0,
    dependencies,
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

const EDIT_GATED_BUTTON_IDS = ["addTaskBtn", "newProjectBtn", "addPhaseBtn", "renameProjectBtn", "deleteProjectBtn"];

function setEditButtonsEnabled(enabled) {
  EDIT_GATED_BUTTON_IDS.forEach((id) => (el(id).disabled = !enabled));
}

async function connectToken() {
  const owner = el("t_owner").value.trim();
  const repo = el("t_repo").value.trim();
  const branch = el("t_branch").value.trim() || "main";
  const token = el("t_token").value.trim();
  const errBox = el("tokenError");

  if (!owner || !repo || !token) {
    errBox.textContent = tr("err_owner_repo_token_required");
    errBox.classList.remove("hidden");
    return;
  }

  const cfg = { owner, repo, branch, token };
  try {
    const res = await apiRequest(cfg, "GET");
    if (!res.ok) {
      errBox.textContent = tr("err_github_rejected", { status: res.status });
      errBox.classList.remove("hidden");
      return;
    }
    setConfig(cfg);
    closeTokenModal();
    setEditButtonsEnabled(true);
    el("connectBtn").textContent = tr("btn_manage_connection");
    await loadProjects();
    renderProjectSelector();
    renderGantt();
    showToast(tr("toast_connected"));
  } catch (e) {
    errBox.textContent = tr("err_network");
    errBox.classList.remove("hidden");
  }
}

function disconnectToken() {
  clearConfig();
  closeTokenModal();
  setEditButtonsEnabled(false);
  el("connectBtn").textContent = tr("btn_connect");
  loadProjects().then(() => {
    renderProjectSelector();
    renderGantt();
    showToast(tr("toast_disconnected"));
  });
}

/* ---------- Save to GitHub ---------- */

async function saveChanges() {
  const cfg = getConfig();
  if (!cfg) return;

  const cur = getCurrentProject();
  if (cur) cur.tasks = tasks;
  const content = b64EncodeUnicode(JSON.stringify({ projects }, null, 2));
  try {
    const res = await apiRequest(cfg, "PUT", {
      message: `Update Gantt data (${new Date().toISOString()})`,
      content,
      sha: fileSha,
      branch: cfg.branch,
    });

    if (res.status === 409 || res.status === 422) {
      showToast(tr("toast_save_conflict"), true);
      await loadProjects();
      renderProjectSelector();
      renderGantt();
      return;
    }
    if (res.status === 401 || res.status === 403) {
      showToast(tr("toast_save_rejected"), true);
      return;
    }
    if (!res.ok) {
      throw new Error(`GitHub API returned ${res.status}`);
    }

    const json = await res.json();
    fileSha = json.content.sha;
    setDirty(false);
    showToast(tr("toast_saved"));
  } catch (e) {
    showToast(tr("toast_save_failed"), true);
  }
}

/* ---------- Wiring ---------- */

function wireUp() {
  document.querySelectorAll(".view-modes button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".view-modes button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentViewMode = btn.dataset.mode;
      // A full re-render (not gantt.change_view_mode in place) so the
      // frozen header clone regenerates too — otherwise it goes stale
      // and shows the previous view mode's date labels.
      renderGantt();
    });
  });

  el("addTaskBtn").addEventListener("click", openNewTaskModal);
  el("addPhaseBtn").addEventListener("click", addPhase);
  el("newProjectBtn").addEventListener("click", addProject);
  el("renameProjectBtn").addEventListener("click", renameProject);
  el("deleteProjectBtn").addEventListener("click", deleteProject);
  el("projectSelect").addEventListener("change", (e) => switchProject(e.target.value));
  el("saveBtn").addEventListener("click", saveChanges);
  el("connectBtn").addEventListener("click", openTokenModal);
  el("langToggle").addEventListener("click", () => setLang(currentLang === "en" ? "ru" : "en"));

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
  attachDependencyLinking();
  applyStaticTranslations();
  const cfg = getConfig();
  setEditButtonsEnabled(!!cfg);
  el("connectBtn").textContent = cfg ? tr("btn_manage_connection") : tr("btn_connect");
  await loadProjects();
  renderProjectSelector();
  renderGantt();
  el("ganttScrollBody").scrollTop = 0; // start at the top regardless of any browser scroll restoration
})();

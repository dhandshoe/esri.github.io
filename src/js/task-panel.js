/**
 * Task Management Panel for ECMS.
 * Manages compliance tasks, completion evidence, and linked obligations.
 * @module js/task-panel
 */

import { API, Fields, TaskStatus, TaskType } from "../utils/constants.js";

let _container = null;
let _apiService = null;
let _selectedTask = null;

export function initialize(options = {}) {
  _container = options.container;
  _apiService = options.apiService;
  if (_container) render();
}

export async function refresh() {
  await loadTasks();
}

export async function loadTasks(filters = {}) {
  let where = "1=1";
  if (filters.projectId) where += ` AND ProjectID='${filters.projectId}'`;
  if (filters.status) where += ` AND TaskStatus='${filters.status}'`;
  if (filters.taskType) where += ` AND TaskType='${filters.taskType}'`;
  if (filters.assignedTo) where += ` AND AssignedTo='${filters.assignedTo}'`;

  try {
    const url = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.TASKS}/query`;
    const params = new URLSearchParams({
      where,
      outFields: "*",
      orderByFields: "DueDate ASC",
      f: "json"
    });
    const resp = await fetch(`${url}?${params}`);
    const data = await resp.json();
    renderTaskList(data.features || []);
  } catch (err) {
    console.error("Failed to load tasks:", err);
  }
}

export function render() {
  if (!_container) return;
  _container.innerHTML = `
    <div class="panel-content">
      <div class="panel-header">
        <h3>Tasks</h3>
        <div class="gap-sm" style="display:flex">
          <calcite-button id="add-task-btn" icon-start="plus" scale="s" appearance="outline">
            Add Task
          </calcite-button>
          <calcite-button id="export-tasks-btn" icon-start="download" scale="s" appearance="outline">
            Export
          </calcite-button>
        </div>
      </div>

      <!-- Filters -->
      <div style="padding:8px 12px; display:flex; gap:8px; flex-wrap:wrap;">
        <calcite-select id="task-project-filter" scale="s" style="width:180px;">
          <calcite-option value="">All Projects</calcite-option>
        </calcite-select>
        <calcite-select id="task-status-filter" scale="s" style="width:140px;">
          <calcite-option value="">All Statuses</calcite-option>
          <calcite-option value="NotStarted">Not Started</calcite-option>
          <calcite-option value="InProgress">In Progress</calcite-option>
          <calcite-option value="Completed">Completed</calcite-option>
          <calcite-option value="Overdue">Overdue</calcite-option>
          <calcite-option value="OnHold">On Hold</calcite-option>
          <calcite-option value="Cancelled">Cancelled</calcite-option>
        </calcite-select>
        <calcite-select id="task-type-filter" scale="s" style="width:160px;">
          <calcite-option value="">All Types</calcite-option>
          <calcite-option value="Monitoring">Monitoring</calcite-option>
          <calcite-option value="Reporting">Reporting</calcite-option>
          <calcite-option value="Inspection">Inspection</calcite-option>
          <calcite-option value="Submission">Submission</calcite-option>
          <calcite-option value="Maintenance">Maintenance</calcite-option>
          <calcite-option value="Training">Training</calcite-option>
          <calcite-option value="Review">Review</calcite-option>
          <calcite-option value="Other">Other</calcite-option>
        </calcite-select>
        <calcite-input id="task-assignee-filter" placeholder="Assigned to..." icon="user" scale="s" clearable style="width:180px;"></calcite-input>
      </div>

      <!-- KPI Summary -->
      <div class="kpi-row" id="task-kpis" style="padding:0 12px;"></div>

      <!-- Task List -->
      <div id="task-list" style="padding:0 12px;"></div>

      <!-- Task Detail -->
      <div id="task-detail" hidden>
        <calcite-panel heading="Task Details" id="task-detail-panel">
          <calcite-action slot="header-actions-end" icon="x" id="close-task-detail" text="Close"></calcite-action>

          <!-- Task Info -->
          <div id="task-info" style="padding:12px;"></div>

          <!-- Tabs for evidence and linked obligations -->
          <calcite-tabs>
            <calcite-tab-nav slot="title-group">
              <calcite-tab-title selected>Completion Evidence</calcite-tab-title>
              <calcite-tab-title>Linked Obligations</calcite-tab-title>
            </calcite-tab-nav>
            <calcite-tab selected><div id="task-evidence"></div></calcite-tab>
            <calcite-tab><div id="task-obligations"></div></calcite-tab>
          </calcite-tabs>
        </calcite-panel>
      </div>
    </div>
  `;

  bindEvents();
  loadTasks();
}

function bindEvents() {
  const addBtn = _container.querySelector("#add-task-btn");
  if (addBtn) addBtn.addEventListener("click", () => showTaskForm());

  const exportBtn = _container.querySelector("#export-tasks-btn");
  if (exportBtn) exportBtn.addEventListener("click", () => exportTasks());

  const closeDetail = _container.querySelector("#close-task-detail");
  if (closeDetail) closeDetail.addEventListener("click", () => hideTaskDetail());

  ["task-project-filter", "task-status-filter", "task-type-filter"].forEach(id => {
    const el = _container.querySelector(`#${id}`);
    if (el) el.addEventListener("calciteSelectChange", () => applyFilters());
  });

  const assigneeInput = _container.querySelector("#task-assignee-filter");
  if (assigneeInput) {
    let timer;
    assigneeInput.addEventListener("calciteInputInput", () => {
      clearTimeout(timer);
      timer = setTimeout(() => applyFilters(), 300);
    });
  }
}

function applyFilters() {
  const projectId = _container.querySelector("#task-project-filter")?.value || "";
  const status = _container.querySelector("#task-status-filter")?.value || "";
  const taskType = _container.querySelector("#task-type-filter")?.value || "";
  const assignedTo = _container.querySelector("#task-assignee-filter")?.value || "";
  loadTasks({ projectId, status, taskType, assignedTo });
}

function renderTaskList(features) {
  const listEl = _container.querySelector("#task-list");
  if (!listEl) return;

  // KPIs
  const kpiEl = _container.querySelector("#task-kpis");
  if (kpiEl) {
    const total = features.length;
    const inProgress = features.filter(f => f.attributes.TaskStatus === "InProgress").length;
    const overdue = features.filter(f => f.attributes.TaskStatus === "Overdue").length;
    const completed = features.filter(f => f.attributes.TaskStatus === "Completed").length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    kpiEl.innerHTML = `
      <calcite-card class="kpi-card"><span class="kpi-value">${total}</span><span class="kpi-label">Total</span></calcite-card>
      <calcite-card class="kpi-card"><span class="kpi-value atrisk">${inProgress}</span><span class="kpi-label">In Progress</span></calcite-card>
      <calcite-card class="kpi-card"><span class="kpi-value noncompliant">${overdue}</span><span class="kpi-label">Overdue</span></calcite-card>
      <calcite-card class="kpi-card"><span class="kpi-value compliant">${completed}</span><span class="kpi-label">Completed</span></calcite-card>
      <calcite-card class="kpi-card"><span class="kpi-value">${completionRate}%</span><span class="kpi-label">Completion Rate</span></calcite-card>
    `;
  }

  if (features.length === 0) {
    listEl.innerHTML = '<calcite-notice open icon="information" scale="s"><div slot="message">No tasks found.</div></calcite-notice>';
    return;
  }

  listEl.innerHTML = '<calcite-list selection-mode="single" id="task-list-items"></calcite-list>';
  const list = listEl.querySelector("#task-list-items");

  features.forEach(f => {
    const a = f.attributes;
    const statusClass = a.TaskStatus === "Overdue" ? "noncompliant"
      : a.TaskStatus === "InProgress" ? "atrisk"
      : a.TaskStatus === "Completed" ? "compliant"
      : "unknown";
    const dueDate = a.DueDate ? new Date(a.DueDate).toLocaleDateString() : "No due date";

    const item = document.createElement("calcite-list-item");
    item.label = a.TaskName || "Untitled Task";
    item.description = `${a.TaskType || ""} | Due: ${dueDate} | ${a.AssignedTo || "Unassigned"}`;
    item.value = a.TaskID;
    item.innerHTML = `<span slot="content-end" class="status-badge status-badge--${statusClass}">${a.TaskStatus || "Unknown"}</span>`;
    item.addEventListener("calciteListItemSelect", () => selectTask(a.TaskID, f));
    list.appendChild(item);
  });
}

export async function selectTask(id, feature) {
  _selectedTask = feature || null;

  // If no feature provided, fetch it
  if (!_selectedTask) {
    try {
      const url = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.TASKS}/query`;
      const params = new URLSearchParams({ where: `TaskID='${id}'`, outFields: "*", f: "json" });
      const resp = await fetch(`${url}?${params}`);
      const data = await resp.json();
      _selectedTask = (data.features || [])[0];
    } catch (err) {
      console.error("Failed to fetch task:", err);
      return;
    }
  }

  if (!_selectedTask) return;

  const detail = _container.querySelector("#task-detail");
  const taskList = _container.querySelector("#task-list");
  if (detail) detail.hidden = false;
  if (taskList) taskList.hidden = true;

  const a = _selectedTask.attributes;
  const infoEl = _container.querySelector("#task-info");
  if (infoEl) {
    const dueDate = a.DueDate ? new Date(a.DueDate).toLocaleDateString() : "N/A";
    const completionDate = a.CompletionDate ? new Date(a.CompletionDate).toLocaleDateString() : "N/A";
    const statusClass = a.TaskStatus === "Overdue" ? "noncompliant"
      : a.TaskStatus === "InProgress" ? "atrisk"
      : a.TaskStatus === "Completed" ? "compliant"
      : "unknown";

    infoEl.innerHTML = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:0.85rem;">
        <div><strong>Task ID:</strong> ${a.TaskID}</div>
        <div><strong>Type:</strong> ${a.TaskType || "N/A"}</div>
        <div><strong>Assigned To:</strong> ${a.AssignedTo || "Unassigned"}</div>
        <div><strong>Status:</strong> <span class="status-badge status-badge--${statusClass}">${a.TaskStatus || "Unknown"}</span></div>
        <div><strong>Due Date:</strong> ${dueDate}</div>
        <div><strong>Completed:</strong> ${completionDate}</div>
        <div><strong>Project:</strong> ${a.ProjectID || "N/A"}</div>
        <div><strong>Priority:</strong> ${a.Priority || "N/A"}</div>
      </div>
      ${a.Description ? `<p class="text-sm text-muted mt-md">${a.Description}</p>` : ""}
      <div style="margin-top:12px; display:flex; gap:8px;">
        <calcite-button id="add-evidence-btn" icon-start="plus" scale="s" appearance="outline">Add Evidence</calcite-button>
        ${a.TaskStatus !== "Completed" ? `<calcite-button id="complete-task-btn" icon-start="check" scale="s" kind="brand">Mark Complete</calcite-button>` : ""}
      </div>
    `;

    const addEvidenceBtn = infoEl.querySelector("#add-evidence-btn");
    if (addEvidenceBtn) addEvidenceBtn.addEventListener("click", () => addEvidence(a.TaskID));

    const completeBtn = infoEl.querySelector("#complete-task-btn");
    if (completeBtn) completeBtn.addEventListener("click", () => completeTask(a.TaskID));
  }

  await Promise.all([
    loadTaskEvidence(id),
    loadTaskObligations(id),
  ]);
}

export async function loadTaskEvidence(taskId) {
  const el = _container.querySelector("#task-evidence");
  if (!el) return;
  try {
    const url = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.COMPLETION_EVIDENCE}/query`;
    const params = new URLSearchParams({ where: `TaskID='${taskId}'`, outFields: "*", orderByFields: "SubmittedDate DESC", f: "json" });
    const resp = await fetch(`${url}?${params}`);
    const data = await resp.json();
    const features = data.features || [];

    if (features.length === 0) {
      el.innerHTML = '<calcite-notice open icon="information" scale="s"><div slot="message">No completion evidence submitted.</div></calcite-notice>';
      return;
    }

    el.innerHTML = `<calcite-list>
      ${features.map(f => {
        const a = f.attributes;
        const date = a.SubmittedDate ? new Date(a.SubmittedDate).toLocaleDateString() : "N/A";
        return `<calcite-list-item label="${a.EvidenceName || a.EvidenceType || 'Evidence'}" description="Submitted: ${date} | By: ${a.SubmittedBy || 'N/A'} | ${a.EvidenceType || ''}">
          <calcite-action slot="actions-end" icon="download" text="Download"></calcite-action>
        </calcite-list-item>`;
      }).join("")}
    </calcite-list>`;
  } catch (err) {
    el.innerHTML = '<calcite-notice open kind="danger"><div slot="message">Failed to load evidence.</div></calcite-notice>';
  }
}

export async function loadTaskObligations(taskId) {
  const el = _container.querySelector("#task-obligations");
  if (!el) return;
  try {
    // Query junction table to find linked ObligationIDs
    const junctionUrl = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.OBLIGATION_TASK_JUNCTION}/query`;
    const jParams = new URLSearchParams({ where: `TaskID='${taskId}'`, outFields: "ObligationID", f: "json" });
    const jResp = await fetch(`${junctionUrl}?${jParams}`);
    const jData = await jResp.json();
    const obligationIds = (jData.features || []).map(f => f.attributes.ObligationID);

    if (obligationIds.length === 0) {
      el.innerHTML = '<calcite-notice open icon="information" scale="s"><div slot="message">No linked obligations.</div></calcite-notice>';
      return;
    }

    const idList = obligationIds.map(id => `'${id}'`).join(",");
    const oblUrl = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.OBLIGATIONS}/query`;
    const oParams = new URLSearchParams({ where: `ObligationID IN (${idList})`, outFields: "*", f: "json" });
    const oResp = await fetch(`${oblUrl}?${oParams}`);
    const oData = await oResp.json();
    const features = oData.features || [];

    el.innerHTML = `<calcite-list>
      ${features.map(f => {
        const a = f.attributes;
        const statusColors = { Active: "compliant", Completed: "compliant", Overdue: "noncompliant", NotStarted: "unknown" };
        return `<calcite-list-item label="${a.ObligationNumber}: ${a.ObligationName || ''}" description="${a.ObligationType || ''} | ${a.ResponsibleCompany || ''}">
          <span slot="content-end" class="status-badge status-badge--${statusColors[a.ObligationStatus] || 'unknown'}">${a.ObligationStatus || 'Unknown'}</span>
        </calcite-list-item>`;
      }).join("")}
    </calcite-list>`;
  } catch (err) {
    el.innerHTML = '<calcite-notice open kind="danger"><div slot="message">Failed to load obligations.</div></calcite-notice>';
  }
}

export function addEvidence(taskId) {
  const event = new CustomEvent("ecms-show-form", {
    detail: { formType: "evidence", data: { taskId } },
    bubbles: true
  });
  _container.dispatchEvent(event);
}

export async function completeTask(taskId) {
  try {
    const url = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.TASKS}/applyEdits`;
    const now = Date.now();
    const body = new URLSearchParams({
      updates: JSON.stringify([{
        attributes: {
          TaskID: taskId,
          TaskStatus: "Completed",
          CompletionDate: now
        }
      }]),
      f: "json"
    });
    const resp = await fetch(url, { method: "POST", body });
    const data = await resp.json();
    if (data.updateResults && data.updateResults[0]?.success) {
      hideTaskDetail();
      await loadTasks();
    } else {
      console.error("Failed to complete task:", data);
    }
  } catch (err) {
    console.error("Error completing task:", err);
  }
}

function hideTaskDetail() {
  const detail = _container.querySelector("#task-detail");
  const taskList = _container.querySelector("#task-list");
  if (detail) detail.hidden = true;
  if (taskList) taskList.hidden = false;
  _selectedTask = null;
}

function showTaskForm(task = null) {
  const event = new CustomEvent("ecms-show-form", {
    detail: { formType: "task", data: task },
    bubbles: true
  });
  _container.dispatchEvent(event);
}

export async function exportTasks() {
  try {
    const url = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.TASKS}/query`;
    const params = new URLSearchParams({ where: "1=1", outFields: "*", f: "json" });
    const resp = await fetch(`${url}?${params}`);
    const data = await resp.json();
    const features = data.features || [];

    if (features.length === 0) return;

    const fields = ["TaskID", "TaskName", "TaskType", "TaskStatus", "AssignedTo", "DueDate", "CompletionDate", "ProjectID", "Priority"];
    const header = fields.join(",");
    const rows = features.map(f => fields.map(field => {
      let val = f.attributes[field] ?? "";
      if (typeof val === "string" && val.includes(",")) val = `"${val}"`;
      return val;
    }).join(","));

    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const dlUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = dlUrl;
    a.download = `tasks_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(dlUrl);
  } catch (err) {
    console.error("Export failed:", err);
  }
}

export function displaySearchResults(results) {
  renderTaskList(results);
}

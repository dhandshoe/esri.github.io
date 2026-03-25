/**
 * Obligation Management Panel for ECMS.
 * Manages compliance obligations linked to regulatory drivers,
 * including tasks, documents, training, and controls.
 * @module js/obligation-panel
 */

import { API, Fields, ObligationType, ObligationStatus, ComplianceStatus } from "../utils/constants.js";

let _container = null;
let _apiService = null;
let _selectedObligation = null;

export function initialize(options = {}) {
  _container = options.container;
  _apiService = options.apiService;
  if (_container) render();
}

export async function refresh() {
  await loadObligations();
}

export async function loadObligations(filters = {}) {
  let where = "1=1";
  if (filters.projectId) where += ` AND ProjectID='${filters.projectId}'`;
  if (filters.driverId) where += ` AND DriverID='${filters.driverId}'`;
  if (filters.obligationType) where += ` AND ObligationType='${filters.obligationType}'`;
  if (filters.status) where += ` AND ObligationStatus='${filters.status}'`;

  try {
    const url = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.OBLIGATIONS}/query`;
    const params = new URLSearchParams({
      where,
      outFields: "*",
      orderByFields: "ObligationNumber ASC",
      f: "json"
    });
    const resp = await fetch(`${url}?${params}`);
    const data = await resp.json();
    renderObligationList(data.features || []);
  } catch (err) {
    console.error("Failed to load obligations:", err);
  }
}

export function render() {
  if (!_container) return;
  _container.innerHTML = `
    <div class="panel-content">
      <div class="panel-header">
        <h3>Obligations</h3>
        <div class="gap-sm" style="display:flex">
          <calcite-button id="add-obligation-btn" icon-start="plus" scale="s" appearance="outline">
            Add Obligation
          </calcite-button>
          <calcite-button id="export-obligations-btn" icon-start="download" scale="s" appearance="outline">
            Export
          </calcite-button>
        </div>
      </div>

      <!-- Filters -->
      <div style="padding:8px 12px; display:flex; gap:8px; flex-wrap:wrap;">
        <calcite-select id="obligation-project-filter" scale="s" style="width:180px;">
          <calcite-option value="">All Projects</calcite-option>
        </calcite-select>
        <calcite-select id="obligation-driver-filter" scale="s" style="width:180px;">
          <calcite-option value="">All Drivers</calcite-option>
        </calcite-select>
        <calcite-select id="obligation-type-filter" scale="s" style="width:160px;">
          <calcite-option value="">All Types</calcite-option>
          <calcite-option value="Continuous">Continuous</calcite-option>
          <calcite-option value="EventDriven">Event Driven</calcite-option>
          <calcite-option value="Direct">Direct</calcite-option>
          <calcite-option value="Periodic">Periodic</calcite-option>
          <calcite-option value="Conditional">Conditional</calcite-option>
          <calcite-option value="OneTime">One Time</calcite-option>
        </calcite-select>
        <calcite-select id="obligation-status-filter" scale="s" style="width:140px;">
          <calcite-option value="">All Statuses</calcite-option>
          <calcite-option value="Active">Active</calcite-option>
          <calcite-option value="Completed">Completed</calcite-option>
          <calcite-option value="Overdue">Overdue</calcite-option>
          <calcite-option value="NotStarted">Not Started</calcite-option>
          <calcite-option value="Waived">Waived</calcite-option>
          <calcite-option value="Superseded">Superseded</calcite-option>
        </calcite-select>
        <calcite-input id="obligation-search" placeholder="Search obligations..." icon="search" scale="s" clearable style="width:200px;"></calcite-input>
      </div>

      <!-- KPI Summary -->
      <div class="kpi-row" id="obligation-kpis" style="padding:0 12px;"></div>

      <!-- Obligation List -->
      <div id="obligation-list" style="padding:0 12px;"></div>

      <!-- Obligation Detail -->
      <div id="obligation-detail" hidden>
        <calcite-panel heading="Obligation Details" id="obligation-detail-panel">
          <calcite-action slot="header-actions-end" icon="x" id="close-obligation-detail" text="Close"></calcite-action>

          <!-- Obligation Info -->
          <div id="obligation-info" style="padding:12px;"></div>

          <!-- Tabs for tasks, documents, training, controls -->
          <calcite-tabs>
            <calcite-tab-nav slot="title-group">
              <calcite-tab-title selected>Tasks</calcite-tab-title>
              <calcite-tab-title>Documents</calcite-tab-title>
              <calcite-tab-title>Training</calcite-tab-title>
              <calcite-tab-title>Controls</calcite-tab-title>
            </calcite-tab-nav>
            <calcite-tab selected><div id="obligation-tasks"></div></calcite-tab>
            <calcite-tab><div id="obligation-documents"></div></calcite-tab>
            <calcite-tab><div id="obligation-training"></div></calcite-tab>
            <calcite-tab><div id="obligation-controls"></div></calcite-tab>
          </calcite-tabs>
        </calcite-panel>
      </div>
    </div>
  `;

  bindEvents();
  loadObligations();
}

function bindEvents() {
  const addBtn = _container.querySelector("#add-obligation-btn");
  if (addBtn) addBtn.addEventListener("click", () => showObligationForm());

  const exportBtn = _container.querySelector("#export-obligations-btn");
  if (exportBtn) exportBtn.addEventListener("click", () => exportObligations());

  const closeDetail = _container.querySelector("#close-obligation-detail");
  if (closeDetail) closeDetail.addEventListener("click", () => hideObligationDetail());

  ["obligation-project-filter", "obligation-driver-filter", "obligation-type-filter", "obligation-status-filter"].forEach(id => {
    const el = _container.querySelector(`#${id}`);
    if (el) el.addEventListener("calciteSelectChange", () => applyFilters());
  });

  const searchInput = _container.querySelector("#obligation-search");
  if (searchInput) {
    let timer;
    searchInput.addEventListener("calciteInputInput", () => {
      clearTimeout(timer);
      timer = setTimeout(() => applyFilters(), 300);
    });
  }
}

function applyFilters() {
  const projectId = _container.querySelector("#obligation-project-filter")?.value || "";
  const driverId = _container.querySelector("#obligation-driver-filter")?.value || "";
  const obligationType = _container.querySelector("#obligation-type-filter")?.value || "";
  const status = _container.querySelector("#obligation-status-filter")?.value || "";
  loadObligations({ projectId, driverId, obligationType, status });
}

function renderObligationList(features) {
  const listEl = _container.querySelector("#obligation-list");
  if (!listEl) return;

  // KPIs
  const kpiEl = _container.querySelector("#obligation-kpis");
  if (kpiEl) {
    const total = features.length;
    const active = features.filter(f => f.attributes.ObligationStatus === "Active").length;
    const overdue = features.filter(f => f.attributes.ObligationStatus === "Overdue").length;
    const completed = features.filter(f => f.attributes.ObligationStatus === "Completed").length;

    kpiEl.innerHTML = `
      <calcite-card class="kpi-card"><span class="kpi-value">${total}</span><span class="kpi-label">Total</span></calcite-card>
      <calcite-card class="kpi-card"><span class="kpi-value compliant">${active}</span><span class="kpi-label">Active</span></calcite-card>
      <calcite-card class="kpi-card"><span class="kpi-value noncompliant">${overdue}</span><span class="kpi-label">Overdue</span></calcite-card>
      <calcite-card class="kpi-card"><span class="kpi-value compliant">${completed}</span><span class="kpi-label">Completed</span></calcite-card>
    `;
  }

  if (features.length === 0) {
    listEl.innerHTML = '<calcite-notice open icon="information" scale="s"><div slot="message">No obligations found.</div></calcite-notice>';
    return;
  }

  listEl.innerHTML = '<calcite-list selection-mode="single" id="obligation-list-items"></calcite-list>';
  const list = listEl.querySelector("#obligation-list-items");

  features.forEach(f => {
    const a = f.attributes;
    const displayName = `${a.ObligationNumber || ""}: ${a.ObligationName || "Untitled"}`;
    const statusClass = a.ObligationStatus === "Active" ? "compliant"
      : a.ObligationStatus === "Overdue" ? "noncompliant"
      : a.ObligationStatus === "Completed" ? "compliant"
      : "unknown";

    const item = document.createElement("calcite-list-item");
    item.label = displayName;
    item.description = `${a.ObligationType || ""} | ${a.ResponsibleCompany || ""} | Driver: ${a.DriverID || "N/A"}`;
    item.value = a.ObligationID;
    item.innerHTML = `<span slot="content-end" class="status-badge status-badge--${statusClass}">${a.ObligationStatus || "Unknown"}</span>`;
    item.addEventListener("calciteListItemSelect", () => selectObligation(a.ObligationID, f));
    list.appendChild(item);
  });
}

export async function selectObligation(id, feature) {
  _selectedObligation = feature;
  const detail = _container.querySelector("#obligation-detail");
  const obligationList = _container.querySelector("#obligation-list");
  if (detail) detail.hidden = false;
  if (obligationList) obligationList.hidden = true;

  const a = feature.attributes;
  const infoEl = _container.querySelector("#obligation-info");
  if (infoEl) {
    const dueDate = a.DueDate ? new Date(a.DueDate).toLocaleDateString() : "N/A";
    const startDate = a.StartDate ? new Date(a.StartDate).toLocaleDateString() : "N/A";

    infoEl.innerHTML = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:0.85rem;">
        <div><strong>Obligation ID:</strong> ${a.ObligationID}</div>
        <div><strong>Number:</strong> ${a.ObligationNumber || "N/A"}</div>
        <div><strong>Type:</strong> ${a.ObligationType || "N/A"}</div>
        <div><strong>Driver:</strong> ${a.DriverID || "N/A"}</div>
        <div><strong>Start Date:</strong> ${startDate}</div>
        <div><strong>Due Date:</strong> ${dueDate}</div>
        <div><strong>Status:</strong> <span class="status-badge status-badge--${a.ObligationStatus === "Active" ? "compliant" : a.ObligationStatus === "Overdue" ? "noncompliant" : "unknown"}">${a.ObligationStatus || "Unknown"}</span></div>
        <div><strong>Responsible:</strong> ${a.ResponsibleCompany || "N/A"}</div>
        <div><strong>Frequency:</strong> ${a.Frequency || "N/A"}</div>
        <div><strong>Risk Score:</strong> ${a.RiskScore != null ? a.RiskScore.toFixed(1) : "N/A"}</div>
      </div>
      ${a.Description ? `<p class="text-sm text-muted mt-md">${a.Description}</p>` : ""}
    `;
  }

  await Promise.all([
    loadObligationTasks(id),
    loadObligationDocuments(id),
    loadObligationTraining(id),
    loadObligationControls(id),
  ]);
}

export async function loadObligationTasks(obligationId) {
  const el = _container.querySelector("#obligation-tasks");
  if (!el) return;
  try {
    // Query junction table first to get TaskIDs
    const junctionUrl = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.OBLIGATION_TASK_JUNCTION}/query`;
    const jParams = new URLSearchParams({ where: `ObligationID='${obligationId}'`, outFields: "TaskID", f: "json" });
    const jResp = await fetch(`${junctionUrl}?${jParams}`);
    const jData = await jResp.json();
    const taskIds = (jData.features || []).map(f => f.attributes.TaskID);

    if (taskIds.length === 0) {
      el.innerHTML = '<calcite-notice open icon="information" scale="s"><div slot="message">No tasks linked to this obligation.</div></calcite-notice>';
      return;
    }

    const taskIdList = taskIds.map(id => `'${id}'`).join(",");
    const taskUrl = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.TASKS}/query`;
    const tParams = new URLSearchParams({ where: `TaskID IN (${taskIdList})`, outFields: "*", orderByFields: "DueDate ASC", f: "json" });
    const tResp = await fetch(`${taskUrl}?${tParams}`);
    const tData = await tResp.json();
    const features = tData.features || [];

    el.innerHTML = `<calcite-list>
      ${features.map(f => {
        const a = f.attributes;
        const statusColors = { InProgress: "atrisk", Completed: "compliant", Overdue: "noncompliant", NotStarted: "unknown", OnHold: "unknown" };
        const dueDate = a.DueDate ? new Date(a.DueDate).toLocaleDateString() : "";
        return `<calcite-list-item label="${a.TaskName || ''}" description="${a.TaskType || ''} | Due: ${dueDate} | ${a.AssignedTo || ''}">
          <span slot="content-end" class="status-badge status-badge--${statusColors[a.TaskStatus] || 'unknown'}">${a.TaskStatus || 'Unknown'}</span>
        </calcite-list-item>`;
      }).join("")}
    </calcite-list>`;
  } catch (err) {
    el.innerHTML = '<calcite-notice open kind="danger"><div slot="message">Failed to load tasks.</div></calcite-notice>';
  }
}

export async function loadObligationDocuments(obligationId) {
  const el = _container.querySelector("#obligation-documents");
  if (!el) return;
  try {
    const url = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.DOCUMENTS}/query`;
    const params = new URLSearchParams({ where: `ObligationID='${obligationId}'`, outFields: "*", orderByFields: "UploadDate DESC", f: "json" });
    const resp = await fetch(`${url}?${params}`);
    const data = await resp.json();
    const features = data.features || [];

    if (features.length === 0) {
      el.innerHTML = '<calcite-notice open icon="information" scale="s"><div slot="message">No documents linked.</div></calcite-notice>';
      return;
    }

    el.innerHTML = `<calcite-list>
      ${features.map(f => {
        const a = f.attributes;
        return `<calcite-list-item label="${a.DocumentName || ''}" description="DCN: ${a.DCN || 'N/A'} | Rev: ${a.Revision || '0'} | ${a.DocumentCategory || ''}">
          <calcite-action slot="actions-end" icon="download" text="Download"></calcite-action>
        </calcite-list-item>`;
      }).join("")}
    </calcite-list>`;
  } catch (err) {
    el.innerHTML = '<calcite-notice open kind="danger"><div slot="message">Failed to load documents.</div></calcite-notice>';
  }
}

export async function loadObligationTraining(obligationId) {
  const el = _container.querySelector("#obligation-training");
  if (!el) return;
  try {
    const url = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.TRAINING_REQUIREMENTS}/query`;
    const params = new URLSearchParams({ where: `ObligationID='${obligationId}'`, outFields: "*", f: "json" });
    const resp = await fetch(`${url}?${params}`);
    const data = await resp.json();
    const features = data.features || [];

    if (features.length === 0) {
      el.innerHTML = '<calcite-notice open icon="information" scale="s"><div slot="message">No training requirements linked.</div></calcite-notice>';
      return;
    }

    el.innerHTML = `<calcite-list>
      ${features.map(f => {
        const a = f.attributes;
        const statusClass = a.Status === "Current" ? "compliant" : a.Status === "Overdue" ? "noncompliant" : "atrisk";
        return `<calcite-list-item label="${a.TrainingName || ''}" description="${a.TrainingType || ''} | Frequency: ${a.Frequency || 'N/A'}">
          <span slot="content-end" class="status-badge status-badge--${statusClass}">${a.Status || 'Unknown'}</span>
        </calcite-list-item>`;
      }).join("")}
    </calcite-list>`;
  } catch (err) {
    el.innerHTML = '<calcite-notice open kind="danger"><div slot="message">Failed to load training requirements.</div></calcite-notice>';
  }
}

async function loadObligationControls(obligationId) {
  const el = _container.querySelector("#obligation-controls");
  if (!el) return;
  try {
    const url = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.CONDITIONS}/query`;
    const params = new URLSearchParams({ where: `ObligationID='${obligationId}'`, outFields: "*", f: "json" });
    const resp = await fetch(`${url}?${params}`);
    const data = await resp.json();
    const features = data.features || [];

    if (features.length === 0) {
      el.innerHTML = '<calcite-notice open icon="information" scale="s"><div slot="message">No controls defined.</div></calcite-notice>';
      return;
    }

    el.innerHTML = `<calcite-list>
      ${features.map(f => {
        const a = f.attributes;
        return `<calcite-list-item label="${a.ConditionText || 'Control'}" description="${a.ConditionType || ''} | ${a.ConditionID || ''}">
        </calcite-list-item>`;
      }).join("")}
    </calcite-list>`;
  } catch (err) {
    el.innerHTML = '<calcite-notice open kind="danger"><div slot="message">Failed to load controls.</div></calcite-notice>';
  }
}

function hideObligationDetail() {
  const detail = _container.querySelector("#obligation-detail");
  const obligationList = _container.querySelector("#obligation-list");
  if (detail) detail.hidden = true;
  if (obligationList) obligationList.hidden = false;
  _selectedObligation = null;
}

function showObligationForm(obligation = null) {
  const event = new CustomEvent("ecms-show-form", {
    detail: { formType: "obligation", data: obligation },
    bubbles: true
  });
  _container.dispatchEvent(event);
}

export async function exportObligations() {
  try {
    const url = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.OBLIGATIONS}/query`;
    const params = new URLSearchParams({ where: "1=1", outFields: "*", f: "json" });
    const resp = await fetch(`${url}?${params}`);
    const data = await resp.json();
    const features = data.features || [];

    if (features.length === 0) return;

    const fields = ["ObligationID", "ObligationNumber", "ObligationName", "ObligationType", "ObligationStatus", "DriverID", "ProjectID", "ResponsibleCompany", "DueDate", "Frequency", "RiskScore"];
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
    a.download = `obligations_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(dlUrl);
  } catch (err) {
    console.error("Export failed:", err);
  }
}

export function displaySearchResults(results) {
  renderObligationList(results);
}

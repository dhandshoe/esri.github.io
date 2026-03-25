/**
 * Training Management Panel for ECMS.
 * Manages training requirements, training history, and
 * a training matrix showing completion status across users.
 * @module js/training-panel
 */

import { API, Fields } from "../utils/constants.js";

let _container = null;
let _apiService = null;
let _currentView = "requirements"; // "requirements" | "matrix"

export function initialize(options = {}) {
  _container = options.container;
  _apiService = options.apiService;
  if (_container) render();
}

export async function refresh() {
  if (_currentView === "requirements") {
    await loadTrainingRequirements();
  } else {
    await loadTrainingMatrix();
  }
}

export function render() {
  if (!_container) return;
  _container.innerHTML = `
    <div class="panel-content">
      <div class="panel-header">
        <h3>Training Management</h3>
        <div class="gap-sm" style="display:flex">
          <calcite-button id="export-training-btn" icon-start="download" scale="s" appearance="outline">
            Export
          </calcite-button>
        </div>
      </div>

      <!-- View Toggle -->
      <div style="padding:8px 12px;">
        <calcite-segmented-control id="training-view-toggle" scale="s" width="auto">
          <calcite-segmented-control-item value="requirements" checked>Requirements</calcite-segmented-control-item>
          <calcite-segmented-control-item value="matrix">Training Matrix</calcite-segmented-control-item>
        </calcite-segmented-control>
      </div>

      <!-- Filters -->
      <div style="padding:4px 12px; display:flex; gap:8px; flex-wrap:wrap;">
        <calcite-select id="training-project-filter" scale="s" style="width:180px;">
          <calcite-option value="">All Projects</calcite-option>
        </calcite-select>
        <calcite-select id="training-status-filter" scale="s" style="width:140px;">
          <calcite-option value="">All Statuses</calcite-option>
          <calcite-option value="Current">Current</calcite-option>
          <calcite-option value="Overdue">Overdue</calcite-option>
          <calcite-option value="Expiring">Expiring Soon</calcite-option>
          <calcite-option value="NotStarted">Not Started</calcite-option>
        </calcite-select>
        <calcite-input id="training-search" placeholder="Search training..." icon="search" scale="s" clearable style="width:200px;"></calcite-input>
      </div>

      <!-- KPI Summary -->
      <div class="kpi-row" id="training-kpis" style="padding:0 12px;"></div>

      <!-- Requirements View -->
      <div id="training-requirements-view" style="padding:0 12px;"></div>

      <!-- Matrix View -->
      <div id="training-matrix-view" style="padding:0 12px;" hidden></div>

      <!-- Individual Training History -->
      <div id="training-history-detail" hidden>
        <calcite-panel heading="Training History" id="training-history-panel">
          <calcite-action slot="header-actions-end" icon="x" id="close-training-history" text="Close"></calcite-action>
          <div id="training-history-content" style="padding:12px;"></div>
        </calcite-panel>
      </div>
    </div>
  `;

  bindEvents();
  loadTrainingRequirements();
}

function bindEvents() {
  const exportBtn = _container.querySelector("#export-training-btn");
  if (exportBtn) exportBtn.addEventListener("click", () => exportTrainingMatrix());

  const closeHistory = _container.querySelector("#close-training-history");
  if (closeHistory) closeHistory.addEventListener("click", () => hideTrainingHistory());

  const viewToggle = _container.querySelector("#training-view-toggle");
  if (viewToggle) {
    viewToggle.addEventListener("calciteSegmentedControlChange", (e) => {
      const val = e.target.value || viewToggle.querySelector("[checked]")?.value || "requirements";
      switchView(val);
    });
  }

  ["training-project-filter", "training-status-filter"].forEach(id => {
    const el = _container.querySelector(`#${id}`);
    if (el) el.addEventListener("calciteSelectChange", () => applyFilters());
  });

  const searchInput = _container.querySelector("#training-search");
  if (searchInput) {
    let timer;
    searchInput.addEventListener("calciteInputInput", () => {
      clearTimeout(timer);
      timer = setTimeout(() => applyFilters(), 300);
    });
  }
}

function switchView(view) {
  _currentView = view;
  const reqView = _container.querySelector("#training-requirements-view");
  const matrixView = _container.querySelector("#training-matrix-view");

  if (view === "requirements") {
    if (reqView) reqView.hidden = false;
    if (matrixView) matrixView.hidden = true;
    loadTrainingRequirements();
  } else {
    if (reqView) reqView.hidden = true;
    if (matrixView) matrixView.hidden = false;
    loadTrainingMatrix();
  }
}

function applyFilters() {
  const projectId = _container.querySelector("#training-project-filter")?.value || "";
  const status = _container.querySelector("#training-status-filter")?.value || "";
  if (_currentView === "requirements") {
    loadTrainingRequirements({ projectId, status });
  } else {
    loadTrainingMatrix({ projectId });
  }
}

export async function loadTrainingRequirements(filters = {}) {
  let where = "1=1";
  if (filters.projectId) where += ` AND ProjectID='${filters.projectId}'`;
  if (filters.status) where += ` AND Status='${filters.status}'`;

  try {
    const url = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.TRAINING_REQUIREMENTS}/query`;
    const params = new URLSearchParams({
      where,
      outFields: "*",
      orderByFields: "TrainingName ASC",
      f: "json"
    });
    const resp = await fetch(`${url}?${params}`);
    const data = await resp.json();
    renderRequirementsList(data.features || []);
  } catch (err) {
    console.error("Failed to load training requirements:", err);
  }
}

function renderRequirementsList(features) {
  const listEl = _container.querySelector("#training-requirements-view");
  if (!listEl) return;

  // KPIs
  const stats = getTrainingStats(features);
  const kpiEl = _container.querySelector("#training-kpis");
  if (kpiEl) {
    kpiEl.innerHTML = `
      <calcite-card class="kpi-card"><span class="kpi-value">${stats.total}</span><span class="kpi-label">Total Requirements</span></calcite-card>
      <calcite-card class="kpi-card"><span class="kpi-value compliant">${stats.current}</span><span class="kpi-label">Current</span></calcite-card>
      <calcite-card class="kpi-card"><span class="kpi-value noncompliant">${stats.overdue}</span><span class="kpi-label">Overdue</span></calcite-card>
      <calcite-card class="kpi-card"><span class="kpi-value atrisk">${stats.expiring}</span><span class="kpi-label">Expiring Soon</span></calcite-card>
    `;
  }

  if (features.length === 0) {
    listEl.innerHTML = '<calcite-notice open icon="information" scale="s"><div slot="message">No training requirements found.</div></calcite-notice>';
    return;
  }

  listEl.innerHTML = '<calcite-list selection-mode="single" id="training-req-list-items"></calcite-list>';
  const list = listEl.querySelector("#training-req-list-items");

  features.forEach(f => {
    const a = f.attributes;
    const statusClass = a.Status === "Current" ? "compliant"
      : a.Status === "Overdue" ? "noncompliant"
      : a.Status === "Expiring" ? "atrisk"
      : "unknown";

    const item = document.createElement("calcite-list-item");
    item.label = a.TrainingName || "Untitled Requirement";
    item.description = `${a.TrainingType || ""} | Frequency: ${a.Frequency || "N/A"} | Obligation: ${a.ObligationID || "N/A"}`;
    item.value = a.TrainingReqID;
    item.innerHTML = `<span slot="content-end" class="status-badge status-badge--${statusClass}">${a.Status || "Unknown"}</span>`;
    list.appendChild(item);
  });
}

async function loadTrainingMatrix(filters = {}) {
  const matrixEl = _container.querySelector("#training-matrix-view");
  if (!matrixEl) return;

  try {
    // Load requirements
    let reqWhere = "1=1";
    if (filters.projectId) reqWhere += ` AND ProjectID='${filters.projectId}'`;

    const reqUrl = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.TRAINING_REQUIREMENTS}/query`;
    const reqParams = new URLSearchParams({ where: reqWhere, outFields: "*", f: "json" });
    const reqResp = await fetch(`${reqUrl}?${reqParams}`);
    const reqData = await reqResp.json();
    const requirements = reqData.features || [];

    // Load training history
    const histUrl = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.TRAINING_HISTORY}/query`;
    const histParams = new URLSearchParams({ where: "1=1", outFields: "*", f: "json" });
    const histResp = await fetch(`${histUrl}?${histParams}`);
    const histData = await histResp.json();
    const history = histData.features || [];

    if (requirements.length === 0) {
      matrixEl.innerHTML = '<calcite-notice open icon="information" scale="s"><div slot="message">No training requirements to display.</div></calcite-notice>';
      return;
    }

    // Build user list from history records
    const userMap = new Map();
    history.forEach(h => {
      const userId = h.attributes.UserID || h.attributes.UserId;
      const userName = h.attributes.UserName || userId;
      if (userId && !userMap.has(userId)) {
        userMap.set(userId, userName);
      }
    });

    const users = Array.from(userMap.entries()); // [[userId, userName], ...]

    if (users.length === 0) {
      matrixEl.innerHTML = '<calcite-notice open icon="information" scale="s"><div slot="message">No training records found.</div></calcite-notice>';
      return;
    }

    // Build completion lookup: userId+reqId -> status
    const completionMap = new Map();
    history.forEach(h => {
      const a = h.attributes;
      const userId = a.UserID || a.UserId;
      const reqId = a.TrainingReqID;
      const key = `${userId}__${reqId}`;
      // Keep the most recent record per user+requirement
      const existing = completionMap.get(key);
      if (!existing || (a.CompletionDate && (!existing.CompletionDate || a.CompletionDate > existing.CompletionDate))) {
        completionMap.set(key, a);
      }
    });

    // Render matrix table
    const reqHeaders = requirements.map(r => `<th style="writing-mode:vertical-lr; text-align:left; padding:8px 4px; font-size:0.75rem; max-width:40px;">${(r.attributes.TrainingName || "").substring(0, 30)}</th>`).join("");

    const rows = users.map(([userId, userName]) => {
      const cells = requirements.map(r => {
        const key = `${userId}__${r.attributes.TrainingReqID}`;
        const record = completionMap.get(key);
        if (!record || !record.CompletionDate) {
          return `<td style="background:#d00000; color:#fff; text-align:center; font-size:0.75rem; cursor:pointer;" data-user="${userId}">--</td>`;
        }
        const expDate = record.ExpirationDate;
        const now = Date.now();
        if (expDate && expDate < now) {
          return `<td style="background:#d00000; color:#fff; text-align:center; font-size:0.75rem; cursor:pointer;" data-user="${userId}">Exp</td>`;
        }
        if (expDate && (expDate - now) < 30 * 24 * 60 * 60 * 1000) {
          return `<td style="background:#e09f3e; color:#000; text-align:center; font-size:0.75rem; cursor:pointer;" data-user="${userId}">${new Date(record.CompletionDate).toLocaleDateString()}</td>`;
        }
        return `<td style="background:#2d6a4f; color:#fff; text-align:center; font-size:0.75rem; cursor:pointer;" data-user="${userId}">${new Date(record.CompletionDate).toLocaleDateString()}</td>`;
      }).join("");

      return `<tr><td style="white-space:nowrap; padding:4px 8px; font-size:0.8rem; font-weight:500; cursor:pointer;" class="matrix-user-cell" data-user="${userId}">${userName}</td>${cells}</tr>`;
    }).join("");

    matrixEl.innerHTML = `
      <div style="font-size:0.75rem; margin-bottom:8px; display:flex; gap:12px;">
        <span><span style="display:inline-block;width:12px;height:12px;background:#2d6a4f;border-radius:2px;"></span> Complete</span>
        <span><span style="display:inline-block;width:12px;height:12px;background:#e09f3e;border-radius:2px;"></span> Expiring</span>
        <span><span style="display:inline-block;width:12px;height:12px;background:#d00000;border-radius:2px;"></span> Overdue / Missing</span>
      </div>
      <div class="audit-table-wrap"><table class="audit-table">
        <thead><tr><th style="min-width:120px;">User</th>${reqHeaders}</tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    `;

    // Click handler for user cells to show history
    matrixEl.querySelectorAll(".matrix-user-cell").forEach(cell => {
      cell.addEventListener("click", () => {
        const userId = cell.dataset.user;
        if (userId) loadTrainingHistory(userId);
      });
    });
  } catch (err) {
    console.error("Failed to load training matrix:", err);
    matrixEl.innerHTML = '<calcite-notice open kind="danger"><div slot="message">Failed to load training matrix.</div></calcite-notice>';
  }
}

export async function loadTrainingHistory(userId) {
  const historyDetail = _container.querySelector("#training-history-detail");
  const reqView = _container.querySelector("#training-requirements-view");
  const matrixView = _container.querySelector("#training-matrix-view");
  if (historyDetail) historyDetail.hidden = false;
  if (reqView) reqView.hidden = true;
  if (matrixView) matrixView.hidden = true;

  const contentEl = _container.querySelector("#training-history-content");
  if (!contentEl) return;

  try {
    const url = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.TRAINING_HISTORY}/query`;
    const params = new URLSearchParams({
      where: `UserID='${userId}' OR UserId='${userId}'`,
      outFields: "*",
      orderByFields: "CompletionDate DESC",
      f: "json"
    });
    const resp = await fetch(`${url}?${params}`);
    const data = await resp.json();
    const features = data.features || [];

    const userName = features[0]?.attributes?.UserName || userId;

    if (features.length === 0) {
      contentEl.innerHTML = `<h4>${userName}</h4><calcite-notice open icon="information" scale="s"><div slot="message">No training history for this user.</div></calcite-notice>`;
      return;
    }

    contentEl.innerHTML = `
      <h4 style="margin-bottom:8px;">${userName}</h4>
      <div class="audit-table-wrap"><table class="audit-table">
        <thead><tr><th>Training</th><th>Completed</th><th>Expires</th><th>Status</th><th>Instructor</th></tr></thead>
        <tbody>${features.map(f => {
          const a = f.attributes;
          const compDate = a.CompletionDate ? new Date(a.CompletionDate).toLocaleDateString() : "N/A";
          const expDate = a.ExpirationDate ? new Date(a.ExpirationDate).toLocaleDateString() : "N/A";
          const now = Date.now();
          let status = "Current";
          if (a.ExpirationDate && a.ExpirationDate < now) status = "Expired";
          else if (a.ExpirationDate && (a.ExpirationDate - now) < 30 * 24 * 60 * 60 * 1000) status = "Expiring";
          const statusClass = status === "Current" ? "compliant" : status === "Expired" ? "noncompliant" : "atrisk";
          return `<tr>
            <td>${a.TrainingName || a.TrainingReqID || "N/A"}</td>
            <td>${compDate}</td>
            <td>${expDate}</td>
            <td><span class="status-badge status-badge--${statusClass}">${status}</span></td>
            <td>${a.Instructor || "N/A"}</td>
          </tr>`;
        }).join("")}</tbody>
      </table></div>
    `;
  } catch (err) {
    contentEl.innerHTML = '<calcite-notice open kind="danger"><div slot="message">Failed to load training history.</div></calcite-notice>';
  }
}

function hideTrainingHistory() {
  const historyDetail = _container.querySelector("#training-history-detail");
  if (historyDetail) historyDetail.hidden = true;

  if (_currentView === "requirements") {
    const reqView = _container.querySelector("#training-requirements-view");
    if (reqView) reqView.hidden = false;
  } else {
    const matrixView = _container.querySelector("#training-matrix-view");
    if (matrixView) matrixView.hidden = false;
  }
}

export function getTrainingStats(features = []) {
  const total = features.length;
  const current = features.filter(f => f.attributes.Status === "Current").length;
  const overdue = features.filter(f => f.attributes.Status === "Overdue").length;
  const expiring = features.filter(f => f.attributes.Status === "Expiring").length;
  return { total, current, overdue, expiring };
}

export async function exportTrainingMatrix() {
  try {
    // Load requirements
    const reqUrl = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.TRAINING_REQUIREMENTS}/query`;
    const reqParams = new URLSearchParams({ where: "1=1", outFields: "*", f: "json" });
    const reqResp = await fetch(`${reqUrl}?${reqParams}`);
    const reqData = await reqResp.json();
    const requirements = reqData.features || [];

    // Load history
    const histUrl = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.TRAINING_HISTORY}/query`;
    const histParams = new URLSearchParams({ where: "1=1", outFields: "*", f: "json" });
    const histResp = await fetch(`${histUrl}?${histParams}`);
    const histData = await histResp.json();
    const history = histData.features || [];

    if (requirements.length === 0) return;

    // Build user list
    const userMap = new Map();
    history.forEach(h => {
      const userId = h.attributes.UserID || h.attributes.UserId;
      const userName = h.attributes.UserName || userId;
      if (userId) userMap.set(userId, userName);
    });

    // Build completion map
    const completionMap = new Map();
    history.forEach(h => {
      const a = h.attributes;
      const key = `${a.UserID || a.UserId}__${a.TrainingReqID}`;
      const existing = completionMap.get(key);
      if (!existing || (a.CompletionDate && (!existing.CompletionDate || a.CompletionDate > existing.CompletionDate))) {
        completionMap.set(key, a);
      }
    });

    // CSV header
    const reqNames = requirements.map(r => `"${(r.attributes.TrainingName || "").replace(/"/g, '""')}"`);
    const header = ["User", ...reqNames].join(",");

    // CSV rows
    const rows = Array.from(userMap.entries()).map(([userId, userName]) => {
      const cells = requirements.map(r => {
        const key = `${userId}__${r.attributes.TrainingReqID}`;
        const record = completionMap.get(key);
        if (!record || !record.CompletionDate) return "Not Completed";
        const expDate = record.ExpirationDate;
        const now = Date.now();
        if (expDate && expDate < now) return "Expired";
        if (expDate && (expDate - now) < 30 * 24 * 60 * 60 * 1000) return "Expiring";
        return new Date(record.CompletionDate).toLocaleDateString();
      });
      return [`"${userName}"`, ...cells].join(",");
    });

    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const dlUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = dlUrl;
    a.download = `training_matrix_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(dlUrl);
  } catch (err) {
    console.error("Export failed:", err);
  }
}

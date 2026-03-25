/**
 * Management of Change (MOC) Panel for ECMS.
 * Manages MOC workflow including initiation, review, approval,
 * implementation, and closure with affected drivers/obligations tracking.
 * @module js/moc-panel
 */

import { API, Fields, MOCStatus } from "../utils/constants.js";

let _container = null;
let _apiService = null;
let _selectedMOC = null;

export function initialize(options = {}) {
  _container = options.container;
  _apiService = options.apiService;
  if (_container) render();
}

export async function refresh() {
  await loadMOCs();
}

export async function loadMOCs(filters = {}) {
  let where = "1=1";
  if (filters.projectId) where += ` AND ProjectID='${filters.projectId}'`;
  if (filters.status) where += ` AND MOCStatus='${filters.status}'`;

  try {
    const url = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.MANAGEMENT_OF_CHANGE}/query`;
    const params = new URLSearchParams({
      where,
      outFields: "*",
      orderByFields: "CreatedDate DESC",
      f: "json"
    });
    const resp = await fetch(`${url}?${params}`);
    const data = await resp.json();
    renderMOCList(data.features || []);
  } catch (err) {
    console.error("Failed to load MOCs:", err);
  }
}

export function render() {
  if (!_container) return;
  _container.innerHTML = `
    <div class="panel-content">
      <div class="panel-header">
        <h3>Management of Change</h3>
        <div class="gap-sm" style="display:flex">
          <calcite-button id="add-moc-btn" icon-start="plus" scale="s" appearance="outline">
            Initiate MOC
          </calcite-button>
          <calcite-button id="export-mocs-btn" icon-start="download" scale="s" appearance="outline">
            Export
          </calcite-button>
        </div>
      </div>

      <!-- Filters -->
      <div style="padding:8px 12px; display:flex; gap:8px; flex-wrap:wrap;">
        <calcite-select id="moc-project-filter" scale="s" style="width:180px;">
          <calcite-option value="">All Projects</calcite-option>
        </calcite-select>
        <calcite-select id="moc-status-filter" scale="s" style="width:160px;">
          <calcite-option value="">All Statuses</calcite-option>
          <calcite-option value="Initiated">Initiated</calcite-option>
          <calcite-option value="UnderReview">Under Review</calcite-option>
          <calcite-option value="Approved">Approved</calcite-option>
          <calcite-option value="Implemented">Implemented</calcite-option>
          <calcite-option value="Closed">Closed</calcite-option>
          <calcite-option value="Rejected">Rejected</calcite-option>
        </calcite-select>
        <calcite-input id="moc-search" placeholder="Search MOCs..." icon="search" scale="s" clearable style="width:200px;"></calcite-input>
      </div>

      <!-- KPI Summary -->
      <div class="kpi-row" id="moc-kpis" style="padding:0 12px;"></div>

      <!-- MOC List -->
      <div id="moc-list" style="padding:0 12px;"></div>

      <!-- MOC Detail -->
      <div id="moc-detail" hidden>
        <calcite-panel heading="MOC Details" id="moc-detail-panel">
          <calcite-action slot="header-actions-end" icon="x" id="close-moc-detail" text="Close"></calcite-action>

          <!-- MOC Info -->
          <div id="moc-info" style="padding:12px;"></div>

          <!-- Workflow Actions -->
          <div id="moc-workflow-actions" style="padding:0 12px 12px;"></div>

          <!-- Tabs for details -->
          <calcite-tabs>
            <calcite-tab-nav slot="title-group">
              <calcite-tab-title selected>Affected Items</calcite-tab-title>
              <calcite-tab-title>Workflow Timeline</calcite-tab-title>
            </calcite-tab-nav>
            <calcite-tab selected><div id="moc-affected-items"></div></calcite-tab>
            <calcite-tab><div id="moc-timeline"></div></calcite-tab>
          </calcite-tabs>
        </calcite-panel>
      </div>
    </div>
  `;

  bindEvents();
  loadMOCs();
}

function bindEvents() {
  const addBtn = _container.querySelector("#add-moc-btn");
  if (addBtn) addBtn.addEventListener("click", () => showMOCForm());

  const exportBtn = _container.querySelector("#export-mocs-btn");
  if (exportBtn) exportBtn.addEventListener("click", () => exportMOCs());

  const closeDetail = _container.querySelector("#close-moc-detail");
  if (closeDetail) closeDetail.addEventListener("click", () => hideMOCDetail());

  ["moc-project-filter", "moc-status-filter"].forEach(id => {
    const el = _container.querySelector(`#${id}`);
    if (el) el.addEventListener("calciteSelectChange", () => applyFilters());
  });

  const searchInput = _container.querySelector("#moc-search");
  if (searchInput) {
    let timer;
    searchInput.addEventListener("calciteInputInput", () => {
      clearTimeout(timer);
      timer = setTimeout(() => applyFilters(), 300);
    });
  }
}

function applyFilters() {
  const projectId = _container.querySelector("#moc-project-filter")?.value || "";
  const status = _container.querySelector("#moc-status-filter")?.value || "";
  loadMOCs({ projectId, status });
}

function renderMOCList(features) {
  const listEl = _container.querySelector("#moc-list");
  if (!listEl) return;

  // KPIs
  const kpiEl = _container.querySelector("#moc-kpis");
  if (kpiEl) {
    const total = features.length;
    const underReview = features.filter(f => f.attributes.MOCStatus === "UnderReview").length;
    const approved = features.filter(f => f.attributes.MOCStatus === "Approved").length;
    const implemented = features.filter(f => f.attributes.MOCStatus === "Implemented").length;

    kpiEl.innerHTML = `
      <calcite-card class="kpi-card"><span class="kpi-value">${total}</span><span class="kpi-label">Total MOCs</span></calcite-card>
      <calcite-card class="kpi-card"><span class="kpi-value atrisk">${underReview}</span><span class="kpi-label">Under Review</span></calcite-card>
      <calcite-card class="kpi-card"><span class="kpi-value compliant">${approved}</span><span class="kpi-label">Approved</span></calcite-card>
      <calcite-card class="kpi-card"><span class="kpi-value compliant">${implemented}</span><span class="kpi-label">Implemented</span></calcite-card>
    `;
  }

  if (features.length === 0) {
    listEl.innerHTML = '<calcite-notice open icon="information" scale="s"><div slot="message">No MOCs found.</div></calcite-notice>';
    return;
  }

  listEl.innerHTML = '<calcite-list selection-mode="single" id="moc-list-items"></calcite-list>';
  const list = listEl.querySelector("#moc-list-items");

  features.forEach(f => {
    const a = f.attributes;
    const statusClass = a.MOCStatus === "Approved" || a.MOCStatus === "Implemented" || a.MOCStatus === "Closed" ? "compliant"
      : a.MOCStatus === "Rejected" ? "noncompliant"
      : a.MOCStatus === "UnderReview" ? "atrisk"
      : "unknown";

    const item = document.createElement("calcite-list-item");
    item.label = `${a.MOCNumber || ""}: ${a.MOCTitle || "Untitled MOC"}`;
    item.description = `Initiated: ${a.CreatedDate ? new Date(a.CreatedDate).toLocaleDateString() : "N/A"} | ${a.InitiatedBy || ""}`;
    item.value = a.MOCID;
    item.innerHTML = `<span slot="content-end" class="status-badge status-badge--${statusClass}">${a.MOCStatus || "Unknown"}</span>`;
    item.addEventListener("calciteListItemSelect", () => selectMOC(a.MOCID, f));
    list.appendChild(item);
  });
}

export async function selectMOC(id, feature) {
  _selectedMOC = feature || null;

  if (!_selectedMOC) {
    try {
      const url = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.MANAGEMENT_OF_CHANGE}/query`;
      const params = new URLSearchParams({ where: `MOCID='${id}'`, outFields: "*", f: "json" });
      const resp = await fetch(`${url}?${params}`);
      const data = await resp.json();
      _selectedMOC = (data.features || [])[0];
    } catch (err) {
      console.error("Failed to fetch MOC:", err);
      return;
    }
  }

  if (!_selectedMOC) return;

  const detail = _container.querySelector("#moc-detail");
  const mocList = _container.querySelector("#moc-list");
  if (detail) detail.hidden = false;
  if (mocList) mocList.hidden = true;

  const a = _selectedMOC.attributes;
  const infoEl = _container.querySelector("#moc-info");
  if (infoEl) {
    const createdDate = a.CreatedDate ? new Date(a.CreatedDate).toLocaleDateString() : "N/A";
    const approvedDate = a.ApprovedDate ? new Date(a.ApprovedDate).toLocaleDateString() : "N/A";
    const implementedDate = a.ImplementedDate ? new Date(a.ImplementedDate).toLocaleDateString() : "N/A";
    const statusClass = a.MOCStatus === "Approved" || a.MOCStatus === "Implemented" ? "compliant"
      : a.MOCStatus === "Rejected" ? "noncompliant"
      : "atrisk";

    infoEl.innerHTML = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:0.85rem;">
        <div><strong>MOC ID:</strong> ${a.MOCID}</div>
        <div><strong>Number:</strong> ${a.MOCNumber || "N/A"}</div>
        <div><strong>Status:</strong> <span class="status-badge status-badge--${statusClass}">${a.MOCStatus || "Unknown"}</span></div>
        <div><strong>Initiated By:</strong> ${a.InitiatedBy || "N/A"}</div>
        <div><strong>Created:</strong> ${createdDate}</div>
        <div><strong>Approved:</strong> ${approvedDate}</div>
        <div><strong>Implemented:</strong> ${implementedDate}</div>
        <div><strong>Project:</strong> ${a.ProjectID || "N/A"}</div>
        <div><strong>Risk Level:</strong> ${a.RiskLevel || "N/A"}</div>
        <div><strong>Change Type:</strong> ${a.ChangeType || "N/A"}</div>
      </div>
      ${a.Description ? `<div style="margin-top:8px;"><strong>Description:</strong><p class="text-sm text-muted">${a.Description}</p></div>` : ""}
      ${a.Justification ? `<div style="margin-top:8px;"><strong>Justification:</strong><p class="text-sm text-muted">${a.Justification}</p></div>` : ""}
      ${a.RiskAssessment ? `<div style="margin-top:8px;"><strong>Risk Assessment:</strong><p class="text-sm text-muted">${a.RiskAssessment}</p></div>` : ""}
    `;
  }

  // Render workflow actions based on current status
  renderWorkflowActions(a);

  await Promise.all([
    loadMOCAffectedItems(a),
    loadMOCTimeline(a),
  ]);
}

function renderWorkflowActions(attributes) {
  const el = _container.querySelector("#moc-workflow-actions");
  if (!el) return;

  const status = attributes.MOCStatus;
  const mocId = attributes.MOCID;
  const actions = [];

  if (status === "Initiated") {
    actions.push(`<calcite-button id="moc-submit-review" scale="s" kind="brand" icon-start="send">Submit for Review</calcite-button>`);
  }
  if (status === "UnderReview") {
    actions.push(`<calcite-button id="moc-approve" scale="s" kind="brand" icon-start="check">Approve</calcite-button>`);
    actions.push(`<calcite-button id="moc-reject" scale="s" kind="danger" icon-start="x" appearance="outline">Reject</calcite-button>`);
  }
  if (status === "Approved") {
    actions.push(`<calcite-button id="moc-implement" scale="s" kind="brand" icon-start="check-circle">Implement</calcite-button>`);
  }
  if (status === "Implemented") {
    actions.push(`<calcite-button id="moc-close" scale="s" kind="brand" icon-start="check-circle-f">Close</calcite-button>`);
  }

  if (actions.length === 0) {
    el.innerHTML = "";
    return;
  }

  el.innerHTML = `<div style="display:flex; gap:8px; flex-wrap:wrap;">${actions.join("")}</div>`;

  // Bind workflow action events
  const submitBtn = el.querySelector("#moc-submit-review");
  if (submitBtn) submitBtn.addEventListener("click", () => updateMOCStatus(mocId, "UnderReview"));

  const approveBtn = el.querySelector("#moc-approve");
  if (approveBtn) approveBtn.addEventListener("click", () => updateMOCStatus(mocId, "Approved"));

  const rejectBtn = el.querySelector("#moc-reject");
  if (rejectBtn) rejectBtn.addEventListener("click", () => updateMOCStatus(mocId, "Rejected"));

  const implementBtn = el.querySelector("#moc-implement");
  if (implementBtn) implementBtn.addEventListener("click", () => updateMOCStatus(mocId, "Implemented"));

  const closeBtn = el.querySelector("#moc-close");
  if (closeBtn) closeBtn.addEventListener("click", () => updateMOCStatus(mocId, "Closed"));
}

export async function updateMOCStatus(mocId, newStatus) {
  try {
    const url = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.MANAGEMENT_OF_CHANGE}/applyEdits`;
    const updateAttrs = { MOCID: mocId, MOCStatus: newStatus };

    // Set date fields based on status transition
    const now = Date.now();
    if (newStatus === "Approved") updateAttrs.ApprovedDate = now;
    if (newStatus === "Implemented") updateAttrs.ImplementedDate = now;
    if (newStatus === "Closed") updateAttrs.ClosedDate = now;

    const body = new URLSearchParams({
      updates: JSON.stringify([{ attributes: updateAttrs }]),
      f: "json"
    });
    const resp = await fetch(url, { method: "POST", body });
    const data = await resp.json();

    if (data.updateResults && data.updateResults[0]?.success) {
      // Refresh the detail view
      _selectedMOC.attributes.MOCStatus = newStatus;
      if (updateAttrs.ApprovedDate) _selectedMOC.attributes.ApprovedDate = updateAttrs.ApprovedDate;
      if (updateAttrs.ImplementedDate) _selectedMOC.attributes.ImplementedDate = updateAttrs.ImplementedDate;
      if (updateAttrs.ClosedDate) _selectedMOC.attributes.ClosedDate = updateAttrs.ClosedDate;
      await selectMOC(mocId, _selectedMOC);
    } else {
      console.error("Failed to update MOC status:", data);
    }
  } catch (err) {
    console.error("Error updating MOC status:", err);
  }
}

async function loadMOCAffectedItems(attributes) {
  const el = _container.querySelector("#moc-affected-items");
  if (!el) return;

  const sections = [];
  const mocId = attributes.MOCID;

  // Affected Drivers
  if (attributes.AffectedDriverIDs) {
    try {
      const driverIds = attributes.AffectedDriverIDs.split(",").map(id => `'${id.trim()}'`).join(",");
      const url = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.DRIVERS}/query`;
      const params = new URLSearchParams({ where: `DriverID IN (${driverIds})`, outFields: "DriverID,DriverName,DriverDisplayName,DriverStatus", f: "json" });
      const resp = await fetch(`${url}?${params}`);
      const data = await resp.json();
      const features = data.features || [];
      if (features.length > 0) {
        sections.push(`<div style="margin-bottom:12px;">
          <h4 style="font-size:0.85rem; margin-bottom:4px;">Affected Drivers (${features.length})</h4>
          <calcite-list>${features.map(f => {
            const a = f.attributes;
            return `<calcite-list-item label="${a.DriverDisplayName || a.DriverName || a.DriverID}" description="Status: ${a.DriverStatus || 'N/A'}"></calcite-list-item>`;
          }).join("")}</calcite-list>
        </div>`);
      }
    } catch (err) { /* skip */ }
  }

  // Affected Obligations
  if (attributes.AffectedObligationIDs) {
    try {
      const oblIds = attributes.AffectedObligationIDs.split(",").map(id => `'${id.trim()}'`).join(",");
      const url = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.OBLIGATIONS}/query`;
      const params = new URLSearchParams({ where: `ObligationID IN (${oblIds})`, outFields: "ObligationID,ObligationNumber,ObligationName,ObligationStatus", f: "json" });
      const resp = await fetch(`${url}?${params}`);
      const data = await resp.json();
      const features = data.features || [];
      if (features.length > 0) {
        sections.push(`<div style="margin-bottom:12px;">
          <h4 style="font-size:0.85rem; margin-bottom:4px;">Affected Obligations (${features.length})</h4>
          <calcite-list>${features.map(f => {
            const a = f.attributes;
            return `<calcite-list-item label="${a.ObligationNumber}: ${a.ObligationName || ''}" description="Status: ${a.ObligationStatus || 'N/A'}"></calcite-list-item>`;
          }).join("")}</calcite-list>
        </div>`);
      }
    } catch (err) { /* skip */ }
  }

  el.innerHTML = sections.length > 0
    ? sections.join("")
    : '<calcite-notice open icon="information" scale="s"><div slot="message">No affected items recorded.</div></calcite-notice>';
}

async function loadMOCTimeline(attributes) {
  const el = _container.querySelector("#moc-timeline");
  if (!el) return;

  const steps = [
    { label: "Initiated", date: attributes.CreatedDate, status: "Initiated" },
    { label: "Under Review", date: attributes.ReviewDate, status: "UnderReview" },
    { label: "Approved", date: attributes.ApprovedDate, status: "Approved" },
    { label: "Implemented", date: attributes.ImplementedDate, status: "Implemented" },
    { label: "Closed", date: attributes.ClosedDate, status: "Closed" },
  ];

  const currentStatus = attributes.MOCStatus;
  const isRejected = currentStatus === "Rejected";

  el.innerHTML = `
    <div style="padding:12px;">
      ${isRejected ? `<calcite-notice open kind="danger" scale="s" style="margin-bottom:12px;"><div slot="message">This MOC was rejected${attributes.RejectionReason ? `: ${attributes.RejectionReason}` : ""}.</div></calcite-notice>` : ""}
      <div style="display:flex; flex-direction:column; gap:4px;">
        ${steps.map((step, i) => {
          const isComplete = step.date != null;
          const isCurrent = step.status === currentStatus;
          const dateStr = step.date ? new Date(step.date).toLocaleDateString() : "";
          const dotColor = isComplete ? "#2d6a4f" : isCurrent ? "#0077b6" : "#adb5bd";
          const lineColor = isComplete ? "#2d6a4f" : "#adb5bd";

          return `<div style="display:flex; align-items:center; gap:12px;">
            <div style="display:flex; flex-direction:column; align-items:center;">
              <div style="width:16px; height:16px; border-radius:50%; background:${dotColor}; border:2px solid ${dotColor};"></div>
              ${i < steps.length - 1 ? `<div style="width:2px; height:24px; background:${lineColor};"></div>` : ""}
            </div>
            <div style="font-size:0.85rem;">
              <strong${isCurrent ? ' style="color:#0077b6;"' : ""}>${step.label}</strong>
              ${dateStr ? `<span class="text-muted" style="margin-left:8px;">${dateStr}</span>` : ""}
            </div>
          </div>`;
        }).join("")}
      </div>
    </div>
  `;
}

function hideMOCDetail() {
  const detail = _container.querySelector("#moc-detail");
  const mocList = _container.querySelector("#moc-list");
  if (detail) detail.hidden = true;
  if (mocList) mocList.hidden = false;
  _selectedMOC = null;
}

function showMOCForm(moc = null) {
  const event = new CustomEvent("ecms-show-form", {
    detail: { formType: "moc", data: moc },
    bubbles: true
  });
  _container.dispatchEvent(event);
}

export async function exportMOCs() {
  try {
    const url = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.MANAGEMENT_OF_CHANGE}/query`;
    const params = new URLSearchParams({ where: "1=1", outFields: "*", f: "json" });
    const resp = await fetch(`${url}?${params}`);
    const data = await resp.json();
    const features = data.features || [];

    if (features.length === 0) return;

    const fields = ["MOCID", "MOCNumber", "MOCTitle", "MOCStatus", "ChangeType", "RiskLevel", "InitiatedBy", "CreatedDate", "ApprovedDate", "ImplementedDate", "ProjectID"];
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
    a.download = `moc_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(dlUrl);
  } catch (err) {
    console.error("Export failed:", err);
  }
}

export function displaySearchResults(results) {
  renderMOCList(results);
}

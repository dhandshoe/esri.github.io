/**
 * Stakeholder Database Panel for ECMS.
 * Manages stakeholder contacts, complaints, and FERC reporting status.
 * @module js/stakeholder-panel
 */

import { API, Fields, StakeholderType } from "../utils/constants.js";

let _container = null;
let _apiService = null;
let _selectedStakeholder = null;
let _selectedComplaint = null;
let _currentTab = "stakeholders"; // "stakeholders" | "complaints"

export function initialize(options = {}) {
  _container = options.container;
  _apiService = options.apiService;
  if (_container) render();
}

export async function refresh() {
  if (_currentTab === "stakeholders") {
    await loadStakeholders();
  } else {
    await loadComplaints();
  }
}

export function render() {
  if (!_container) return;
  _container.innerHTML = `
    <div class="panel-content">
      <div class="panel-header">
        <h3>Stakeholder Database</h3>
        <div class="gap-sm" style="display:flex">
          <calcite-button id="add-stakeholder-btn" icon-start="plus" scale="s" appearance="outline">
            Add
          </calcite-button>
          <calcite-button id="export-stakeholders-btn" icon-start="download" scale="s" appearance="outline">
            Export
          </calcite-button>
        </div>
      </div>

      <!-- View Toggle -->
      <div style="padding:8px 12px;">
        <calcite-segmented-control id="stakeholder-view-toggle" scale="s" width="auto">
          <calcite-segmented-control-item value="stakeholders" checked>Stakeholders</calcite-segmented-control-item>
          <calcite-segmented-control-item value="complaints">Complaints</calcite-segmented-control-item>
        </calcite-segmented-control>
      </div>

      <!-- Filters -->
      <div style="padding:4px 12px; display:flex; gap:8px; flex-wrap:wrap;">
        <calcite-select id="stakeholder-project-filter" scale="s" style="width:180px;">
          <calcite-option value="">All Projects</calcite-option>
        </calcite-select>
        <calcite-select id="stakeholder-type-filter" scale="s" style="width:160px;">
          <calcite-option value="">All Types</calcite-option>
          <calcite-option value="Landowner">Landowner</calcite-option>
          <calcite-option value="Agency">Agency</calcite-option>
          <calcite-option value="Contractor">Contractor</calcite-option>
          <calcite-option value="Community">Community</calcite-option>
          <calcite-option value="Tribal">Tribal</calcite-option>
          <calcite-option value="NGO">NGO</calcite-option>
          <calcite-option value="Government">Government</calcite-option>
          <calcite-option value="Other">Other</calcite-option>
        </calcite-select>
        <calcite-input id="stakeholder-search" placeholder="Search stakeholders..." icon="search" scale="s" clearable style="width:200px;"></calcite-input>
      </div>

      <!-- KPI Summary -->
      <div class="kpi-row" id="stakeholder-kpis" style="padding:0 12px;"></div>

      <!-- Stakeholder List View -->
      <div id="stakeholder-list-view" style="padding:0 12px;"></div>

      <!-- Complaint List View -->
      <div id="complaint-list-view" style="padding:0 12px;" hidden></div>

      <!-- Stakeholder Detail -->
      <div id="stakeholder-detail" hidden>
        <calcite-panel heading="Stakeholder Details" id="stakeholder-detail-panel">
          <calcite-action slot="header-actions-end" icon="x" id="close-stakeholder-detail" text="Close"></calcite-action>
          <div id="stakeholder-info" style="padding:12px;"></div>
          <div style="padding:0 12px;">
            <h4 style="font-size:0.85rem; margin-bottom:8px;">Complaint History</h4>
            <div id="stakeholder-complaints"></div>
          </div>
        </calcite-panel>
      </div>

      <!-- Complaint Detail -->
      <div id="complaint-detail" hidden>
        <calcite-panel heading="Complaint Details" id="complaint-detail-panel">
          <calcite-action slot="header-actions-end" icon="x" id="close-complaint-detail" text="Close"></calcite-action>
          <div id="complaint-info" style="padding:12px;"></div>
        </calcite-panel>
      </div>
    </div>
  `;

  bindEvents();
  loadStakeholders();
  loadStakeholderKPIs();
}

function bindEvents() {
  const addBtn = _container.querySelector("#add-stakeholder-btn");
  if (addBtn) addBtn.addEventListener("click", () => {
    if (_currentTab === "stakeholders") showStakeholderForm();
    else showComplaintForm();
  });

  const exportBtn = _container.querySelector("#export-stakeholders-btn");
  if (exportBtn) exportBtn.addEventListener("click", () => exportStakeholders());

  const closeStakeholderDetail = _container.querySelector("#close-stakeholder-detail");
  if (closeStakeholderDetail) closeStakeholderDetail.addEventListener("click", () => hideStakeholderDetail());

  const closeComplaintDetail = _container.querySelector("#close-complaint-detail");
  if (closeComplaintDetail) closeComplaintDetail.addEventListener("click", () => hideComplaintDetail());

  const viewToggle = _container.querySelector("#stakeholder-view-toggle");
  if (viewToggle) {
    viewToggle.addEventListener("calciteSegmentedControlChange", (e) => {
      const val = e.target.value || viewToggle.querySelector("[checked]")?.value || "stakeholders";
      switchView(val);
    });
  }

  ["stakeholder-project-filter", "stakeholder-type-filter"].forEach(id => {
    const el = _container.querySelector(`#${id}`);
    if (el) el.addEventListener("calciteSelectChange", () => applyFilters());
  });

  const searchInput = _container.querySelector("#stakeholder-search");
  if (searchInput) {
    let timer;
    searchInput.addEventListener("calciteInputInput", () => {
      clearTimeout(timer);
      timer = setTimeout(() => applyFilters(), 300);
    });
  }
}

function switchView(view) {
  _currentTab = view;
  const stakeholderView = _container.querySelector("#stakeholder-list-view");
  const complaintView = _container.querySelector("#complaint-list-view");

  if (view === "stakeholders") {
    if (stakeholderView) stakeholderView.hidden = false;
    if (complaintView) complaintView.hidden = true;
    loadStakeholders();
  } else {
    if (stakeholderView) stakeholderView.hidden = true;
    if (complaintView) complaintView.hidden = false;
    loadComplaints();
  }
}

function applyFilters() {
  const projectId = _container.querySelector("#stakeholder-project-filter")?.value || "";
  const stakeholderType = _container.querySelector("#stakeholder-type-filter")?.value || "";
  if (_currentTab === "stakeholders") {
    loadStakeholders({ projectId, stakeholderType });
  } else {
    loadComplaints({ projectId });
  }
}

async function loadStakeholderKPIs() {
  try {
    const [stakeholderResp, complaintResp] = await Promise.all([
      fetch(`${API.FEATURE_SERVICE_URL}/${API.LAYERS.STAKEHOLDERS}/query?${new URLSearchParams({ where: "1=1", returnCountOnly: true, f: "json" })}`),
      fetch(`${API.FEATURE_SERVICE_URL}/${API.LAYERS.STAKEHOLDER_COMPLAINTS}/query?${new URLSearchParams({ where: "1=1", outFields: "ComplaintStatus,FERCReportRequired", f: "json" })}`)
    ]);

    const stakeholderData = await stakeholderResp.json();
    const complaintData = await complaintResp.json();

    const totalStakeholders = stakeholderData.count || 0;
    const complaints = complaintData.features || [];
    const activeComplaints = complaints.filter(f => f.attributes.ComplaintStatus === "Open" || f.attributes.ComplaintStatus === "InProgress").length;
    const fercDue = complaints.filter(f => f.attributes.FERCReportRequired === "Yes" && f.attributes.ComplaintStatus !== "Closed").length;

    const kpiEl = _container.querySelector("#stakeholder-kpis");
    if (kpiEl) {
      kpiEl.innerHTML = `
        <calcite-card class="kpi-card"><span class="kpi-value">${totalStakeholders}</span><span class="kpi-label">Total Stakeholders</span></calcite-card>
        <calcite-card class="kpi-card"><span class="kpi-value noncompliant">${activeComplaints}</span><span class="kpi-label">Active Complaints</span></calcite-card>
        <calcite-card class="kpi-card"><span class="kpi-value atrisk">${fercDue}</span><span class="kpi-label">FERC Reports Due</span></calcite-card>
      `;
    }
  } catch (err) {
    console.error("Failed to load stakeholder KPIs:", err);
  }
}

export async function loadStakeholders(filters = {}) {
  let where = "1=1";
  if (filters.projectId) where += ` AND ProjectID='${filters.projectId}'`;
  if (filters.stakeholderType) where += ` AND StakeholderType='${filters.stakeholderType}'`;

  try {
    const url = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.STAKEHOLDERS}/query`;
    const params = new URLSearchParams({
      where,
      outFields: "*",
      orderByFields: "StakeholderName ASC",
      f: "json"
    });
    const resp = await fetch(`${url}?${params}`);
    const data = await resp.json();
    renderStakeholderList(data.features || []);
  } catch (err) {
    console.error("Failed to load stakeholders:", err);
  }
}

function renderStakeholderList(features) {
  const listEl = _container.querySelector("#stakeholder-list-view");
  if (!listEl) return;

  if (features.length === 0) {
    listEl.innerHTML = '<calcite-notice open icon="information" scale="s"><div slot="message">No stakeholders found.</div></calcite-notice>';
    return;
  }

  listEl.innerHTML = '<calcite-list selection-mode="single" id="stakeholder-list-items"></calcite-list>';
  const list = listEl.querySelector("#stakeholder-list-items");

  features.forEach(f => {
    const a = f.attributes;
    const typeClass = a.StakeholderType === "Agency" || a.StakeholderType === "Government" ? "atrisk"
      : a.StakeholderType === "Tribal" ? "noncompliant"
      : "unknown";

    const item = document.createElement("calcite-list-item");
    item.label = a.StakeholderName || "Unknown Stakeholder";
    item.description = `${a.StakeholderType || "N/A"} | ${a.Organization || ""} | ${a.Email || ""}`;
    item.value = a.StakeholderID;
    item.innerHTML = `<span slot="content-end" class="status-badge status-badge--${typeClass}">${a.StakeholderType || "Unknown"}</span>`;
    item.addEventListener("calciteListItemSelect", () => selectStakeholder(a.StakeholderID, f));
    list.appendChild(item);
  });
}

export async function selectStakeholder(id, feature) {
  _selectedStakeholder = feature || null;

  if (!_selectedStakeholder) {
    try {
      const url = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.STAKEHOLDERS}/query`;
      const params = new URLSearchParams({ where: `StakeholderID='${id}'`, outFields: "*", f: "json" });
      const resp = await fetch(`${url}?${params}`);
      const data = await resp.json();
      _selectedStakeholder = (data.features || [])[0];
    } catch (err) {
      console.error("Failed to fetch stakeholder:", err);
      return;
    }
  }

  if (!_selectedStakeholder) return;

  const detail = _container.querySelector("#stakeholder-detail");
  const listView = _container.querySelector("#stakeholder-list-view");
  const complaintView = _container.querySelector("#complaint-list-view");
  if (detail) detail.hidden = false;
  if (listView) listView.hidden = true;
  if (complaintView) complaintView.hidden = true;

  const a = _selectedStakeholder.attributes;
  const infoEl = _container.querySelector("#stakeholder-info");
  if (infoEl) {
    infoEl.innerHTML = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:0.85rem;">
        <div><strong>Name:</strong> ${a.StakeholderName || "N/A"}</div>
        <div><strong>Type:</strong> ${a.StakeholderType || "N/A"}</div>
        <div><strong>Organization:</strong> ${a.Organization || "N/A"}</div>
        <div><strong>Title:</strong> ${a.Title || "N/A"}</div>
        <div><strong>Email:</strong> ${a.Email || "N/A"}</div>
        <div><strong>Phone:</strong> ${a.Phone || "N/A"}</div>
        <div><strong>Address:</strong> ${a.Address || "N/A"}</div>
        <div><strong>Project:</strong> ${a.ProjectID || "N/A"}</div>
        <div><strong>Status:</strong> ${a.Status || "Active"}</div>
        <div><strong>Parcel #:</strong> ${a.ParcelNumber || "N/A"}</div>
      </div>
      ${a.Notes ? `<p class="text-sm text-muted mt-md">${a.Notes}</p>` : ""}
    `;
  }

  await loadStakeholderComplaints(id);
}

async function loadStakeholderComplaints(stakeholderId) {
  const el = _container.querySelector("#stakeholder-complaints");
  if (!el) return;
  try {
    const url = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.STAKEHOLDER_COMPLAINTS}/query`;
    const params = new URLSearchParams({ where: `StakeholderID='${stakeholderId}'`, outFields: "*", orderByFields: "ComplaintDate DESC", f: "json" });
    const resp = await fetch(`${url}?${params}`);
    const data = await resp.json();
    const features = data.features || [];

    if (features.length === 0) {
      el.innerHTML = '<calcite-notice open icon="information" scale="s"><div slot="message">No complaints recorded for this stakeholder.</div></calcite-notice>';
      return;
    }

    el.innerHTML = `<calcite-list>
      ${features.map(f => {
        const a = f.attributes;
        const statusClass = a.ComplaintStatus === "Closed" || a.ComplaintStatus === "Resolved" ? "compliant"
          : a.ComplaintStatus === "Open" ? "noncompliant"
          : "atrisk";
        const date = a.ComplaintDate ? new Date(a.ComplaintDate).toLocaleDateString() : "N/A";
        const fercTag = a.FERCReportRequired === "Yes" ? ' <span class="status-badge status-badge--noncompliant" style="font-size:0.65rem;">FERC</span>' : "";
        return `<calcite-list-item label="${a.ComplaintType || 'Complaint'} - ${date}${fercTag}" description="${(a.Description || '').substring(0, 100)}">
          <span slot="content-end" class="status-badge status-badge--${statusClass}">${a.ComplaintStatus || 'Unknown'}</span>
        </calcite-list-item>`;
      }).join("")}
    </calcite-list>`;
  } catch (err) {
    el.innerHTML = '<calcite-notice open kind="danger"><div slot="message">Failed to load complaints.</div></calcite-notice>';
  }
}

export async function loadComplaints(filters = {}) {
  let where = "1=1";
  if (filters.projectId) where += ` AND ProjectID='${filters.projectId}'`;
  if (filters.status) where += ` AND ComplaintStatus='${filters.status}'`;

  try {
    const url = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.STAKEHOLDER_COMPLAINTS}/query`;
    const params = new URLSearchParams({
      where,
      outFields: "*",
      orderByFields: "ComplaintDate DESC",
      f: "json"
    });
    const resp = await fetch(`${url}?${params}`);
    const data = await resp.json();
    renderComplaintList(data.features || []);
  } catch (err) {
    console.error("Failed to load complaints:", err);
  }
}

function renderComplaintList(features) {
  const listEl = _container.querySelector("#complaint-list-view");
  if (!listEl) return;

  if (features.length === 0) {
    listEl.innerHTML = '<calcite-notice open icon="information" scale="s"><div slot="message">No complaints found.</div></calcite-notice>';
    return;
  }

  listEl.innerHTML = '<calcite-list selection-mode="single" id="complaint-list-items"></calcite-list>';
  const list = listEl.querySelector("#complaint-list-items");

  features.forEach(f => {
    const a = f.attributes;
    const statusClass = a.ComplaintStatus === "Closed" || a.ComplaintStatus === "Resolved" ? "compliant"
      : a.ComplaintStatus === "Open" ? "noncompliant"
      : "atrisk";
    const date = a.ComplaintDate ? new Date(a.ComplaintDate).toLocaleDateString() : "N/A";
    const fercIndicator = a.FERCReportRequired === "Yes" ? " [FERC]" : "";

    const item = document.createElement("calcite-list-item");
    item.label = `${a.ComplaintType || "Complaint"} - ${date}${fercIndicator}`;
    item.description = `Stakeholder: ${a.StakeholderName || a.StakeholderID || "N/A"} | ${(a.Description || "").substring(0, 80)}`;
    item.value = a.ComplaintID;
    item.innerHTML = `<span slot="content-end" class="status-badge status-badge--${statusClass}">${a.ComplaintStatus || "Unknown"}</span>`;
    item.addEventListener("calciteListItemSelect", () => selectComplaint(a.ComplaintID, f));
    list.appendChild(item);
  });
}

export async function selectComplaint(id, feature) {
  _selectedComplaint = feature || null;

  if (!_selectedComplaint) {
    try {
      const url = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.STAKEHOLDER_COMPLAINTS}/query`;
      const params = new URLSearchParams({ where: `ComplaintID='${id}'`, outFields: "*", f: "json" });
      const resp = await fetch(`${url}?${params}`);
      const data = await resp.json();
      _selectedComplaint = (data.features || [])[0];
    } catch (err) {
      console.error("Failed to fetch complaint:", err);
      return;
    }
  }

  if (!_selectedComplaint) return;

  const detail = _container.querySelector("#complaint-detail");
  const listView = _container.querySelector("#stakeholder-list-view");
  const complaintView = _container.querySelector("#complaint-list-view");
  if (detail) detail.hidden = false;
  if (listView) listView.hidden = true;
  if (complaintView) complaintView.hidden = true;

  const a = _selectedComplaint.attributes;
  const infoEl = _container.querySelector("#complaint-info");
  if (infoEl) {
    const complaintDate = a.ComplaintDate ? new Date(a.ComplaintDate).toLocaleDateString() : "N/A";
    const resolvedDate = a.ResolvedDate ? new Date(a.ResolvedDate).toLocaleDateString() : "N/A";
    const fercDueDate = a.FERCReportDueDate ? new Date(a.FERCReportDueDate).toLocaleDateString() : "N/A";
    const statusClass = a.ComplaintStatus === "Closed" || a.ComplaintStatus === "Resolved" ? "compliant"
      : a.ComplaintStatus === "Open" ? "noncompliant"
      : "atrisk";

    infoEl.innerHTML = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:0.85rem;">
        <div><strong>Complaint ID:</strong> ${a.ComplaintID}</div>
        <div><strong>Type:</strong> ${a.ComplaintType || "N/A"}</div>
        <div><strong>Stakeholder:</strong> ${a.StakeholderName || a.StakeholderID || "N/A"}</div>
        <div><strong>Status:</strong> <span class="status-badge status-badge--${statusClass}">${a.ComplaintStatus || "Unknown"}</span></div>
        <div><strong>Date Filed:</strong> ${complaintDate}</div>
        <div><strong>Resolved:</strong> ${resolvedDate}</div>
        <div><strong>Project:</strong> ${a.ProjectID || "N/A"}</div>
        <div><strong>Location:</strong> ${a.Location || "N/A"}</div>
      </div>

      ${a.Description ? `<div style="margin-top:8px;"><strong>Description:</strong><p class="text-sm text-muted">${a.Description}</p></div>` : ""}
      ${a.Resolution ? `<div style="margin-top:8px;"><strong>Resolution:</strong><p class="text-sm text-muted">${a.Resolution}</p></div>` : ""}

      <!-- FERC Reporting Section -->
      <div style="margin-top:12px; padding:8px; background:var(--calcite-color-foreground-2, #f3f3f3); border-radius:4px;">
        <h4 style="font-size:0.85rem; margin-bottom:4px;">FERC Reporting</h4>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:0.85rem;">
          <div><strong>FERC Report Required:</strong> ${a.FERCReportRequired || "No"}</div>
          <div><strong>Report Due Date:</strong> ${fercDueDate}</div>
          <div><strong>Report Status:</strong> ${a.FERCReportStatus || "N/A"}</div>
          <div><strong>Report Filed:</strong> ${a.FERCReportFiledDate ? new Date(a.FERCReportFiledDate).toLocaleDateString() : "N/A"}</div>
        </div>
      </div>
    `;
  }
}

function hideStakeholderDetail() {
  const detail = _container.querySelector("#stakeholder-detail");
  if (detail) detail.hidden = true;
  showCurrentListView();
  _selectedStakeholder = null;
}

function hideComplaintDetail() {
  const detail = _container.querySelector("#complaint-detail");
  if (detail) detail.hidden = true;
  showCurrentListView();
  _selectedComplaint = null;
}

function showCurrentListView() {
  if (_currentTab === "stakeholders") {
    const listView = _container.querySelector("#stakeholder-list-view");
    if (listView) listView.hidden = false;
  } else {
    const complaintView = _container.querySelector("#complaint-list-view");
    if (complaintView) complaintView.hidden = false;
  }
}

function showStakeholderForm(stakeholder = null) {
  const event = new CustomEvent("ecms-show-form", {
    detail: { formType: "stakeholder", data: stakeholder },
    bubbles: true
  });
  _container.dispatchEvent(event);
}

function showComplaintForm(complaint = null) {
  const event = new CustomEvent("ecms-show-form", {
    detail: { formType: "complaint", data: complaint },
    bubbles: true
  });
  _container.dispatchEvent(event);
}

export async function exportStakeholders() {
  try {
    const url = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.STAKEHOLDERS}/query`;
    const params = new URLSearchParams({ where: "1=1", outFields: "*", f: "json" });
    const resp = await fetch(`${url}?${params}`);
    const data = await resp.json();
    const features = data.features || [];

    if (features.length === 0) return;

    const fields = ["StakeholderID", "StakeholderName", "StakeholderType", "Organization", "Title", "Email", "Phone", "Address", "ProjectID", "Status"];
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
    a.download = `stakeholders_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(dlUrl);
  } catch (err) {
    console.error("Export failed:", err);
  }
}

export function displaySearchResults(results) {
  if (_currentTab === "stakeholders") {
    renderStakeholderList(results);
  } else {
    renderComplaintList(results);
  }
}

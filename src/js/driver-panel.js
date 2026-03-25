/**
 * Driver Management Panel for ECMS.
 * Manages regulatory drivers (permits, land use agreements, etc.),
 * their amendments, POCs, and linked obligations.
 * @module js/driver-panel
 */

import { API, Fields, DriverType, ComplianceStatus } from "../utils/constants.js";

let _container = null;
let _apiService = null;
let _selectedDriver = null;

export function initialize(options = {}) {
  _container = options.container;
  _apiService = options.apiService;
  if (_container) render();
}

export async function refresh() {
  await loadDrivers();
}

async function loadDrivers(filters = {}) {
  // Build where clause from filters
  let where = "1=1";
  if (filters.projectId) where += ` AND ProjectID='${filters.projectId}'`;
  if (filters.driverType) where += ` AND DriverType='${filters.driverType}'`;
  if (filters.status) where += ` AND DriverStatus='${filters.status}'`;

  try {
    const url = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.DRIVERS}/query`;
    const params = new URLSearchParams({
      where,
      outFields: "*",
      orderByFields: "DriverName ASC",
      f: "json"
    });
    const resp = await fetch(`${url}?${params}`);
    const data = await resp.json();
    renderDriverList(data.features || []);
  } catch (err) {
    console.error("Failed to load drivers:", err);
  }
}

function render() {
  if (!_container) return;
  _container.innerHTML = `
    <div class="panel-content">
      <div class="panel-header">
        <h3>Regulatory Drivers</h3>
        <div class="gap-sm" style="display:flex">
          <calcite-button id="add-driver-btn" icon-start="plus" scale="s" appearance="outline">
            Add Driver
          </calcite-button>
          <calcite-button id="export-drivers-btn" icon-start="download" scale="s" appearance="outline">
            Export
          </calcite-button>
        </div>
      </div>

      <!-- Filters -->
      <div style="padding:8px 12px; display:flex; gap:8px; flex-wrap:wrap;">
        <calcite-select id="driver-project-filter" scale="s" style="width:180px;">
          <calcite-option value="">All Projects</calcite-option>
        </calcite-select>
        <calcite-select id="driver-type-filter" scale="s" style="width:160px;">
          <calcite-option value="">All Types</calcite-option>
          <calcite-option value="Permit">Permit</calcite-option>
          <calcite-option value="LandUseAgreement">Land Use Agreement</calcite-option>
          <calcite-option value="RegulatoryOrder">Regulatory Order</calcite-option>
          <calcite-option value="Consent">Consent</calcite-option>
          <calcite-option value="Authorization">Authorization</calcite-option>
          <calcite-option value="Certification">Certification</calcite-option>
          <calcite-option value="License">License</calcite-option>
        </calcite-select>
        <calcite-select id="driver-status-filter" scale="s" style="width:140px;">
          <calcite-option value="">All Statuses</calcite-option>
          <calcite-option value="Active">Active</calcite-option>
          <calcite-option value="Expired">Expired</calcite-option>
          <calcite-option value="Pending">Pending</calcite-option>
          <calcite-option value="Amended">Amended</calcite-option>
          <calcite-option value="Renewed">Renewed</calcite-option>
        </calcite-select>
        <calcite-input id="driver-search" placeholder="Search drivers..." icon="search" scale="s" clearable style="width:200px;"></calcite-input>
      </div>

      <!-- KPI Summary -->
      <div class="kpi-row" id="driver-kpis" style="padding:0 12px;"></div>

      <!-- Driver List -->
      <div id="driver-list" style="padding:0 12px;"></div>

      <!-- Driver Detail -->
      <div id="driver-detail" hidden>
        <calcite-panel heading="Driver Details" id="driver-detail-panel">
          <calcite-action slot="header-actions-end" icon="x" id="close-driver-detail" text="Close"></calcite-action>

          <!-- Driver Info -->
          <div id="driver-info" style="padding:12px;"></div>

          <!-- Tabs for amendments, POCs, obligations, documents -->
          <calcite-tabs>
            <calcite-tab-nav slot="title-group">
              <calcite-tab-title selected>Obligations</calcite-tab-title>
              <calcite-tab-title>Amendments</calcite-tab-title>
              <calcite-tab-title>POCs</calcite-tab-title>
              <calcite-tab-title>Documents</calcite-tab-title>
            </calcite-tab-nav>
            <calcite-tab selected><div id="driver-obligations"></div></calcite-tab>
            <calcite-tab><div id="driver-amendments"></div></calcite-tab>
            <calcite-tab><div id="driver-pocs"></div></calcite-tab>
            <calcite-tab><div id="driver-documents"></div></calcite-tab>
          </calcite-tabs>
        </calcite-panel>
      </div>
    </div>
  `;

  bindEvents();
  loadDrivers();
}

function bindEvents() {
  const addBtn = _container.querySelector("#add-driver-btn");
  if (addBtn) addBtn.addEventListener("click", () => showDriverForm());

  const exportBtn = _container.querySelector("#export-drivers-btn");
  if (exportBtn) exportBtn.addEventListener("click", () => exportDrivers());

  const closeDetail = _container.querySelector("#close-driver-detail");
  if (closeDetail) closeDetail.addEventListener("click", () => hideDriverDetail());

  // Filter change events
  ["driver-project-filter", "driver-type-filter", "driver-status-filter"].forEach(id => {
    const el = _container.querySelector(`#${id}`);
    if (el) el.addEventListener("calciteSelectChange", () => applyFilters());
  });

  const searchInput = _container.querySelector("#driver-search");
  if (searchInput) {
    let timer;
    searchInput.addEventListener("calciteInputInput", (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => applyFilters(), 300);
    });
  }
}

function applyFilters() {
  const projectId = _container.querySelector("#driver-project-filter")?.value || "";
  const driverType = _container.querySelector("#driver-type-filter")?.value || "";
  const status = _container.querySelector("#driver-status-filter")?.value || "";
  loadDrivers({ projectId, driverType, status });
}

function renderDriverList(features) {
  const listEl = _container.querySelector("#driver-list");
  if (!listEl) return;

  // KPIs
  const kpiEl = _container.querySelector("#driver-kpis");
  if (kpiEl) {
    const total = features.length;
    const active = features.filter(f => f.attributes.DriverStatus === "Active").length;
    const expiring = features.filter(f => {
      const exp = f.attributes.ExpirationDate;
      if (!exp) return false;
      const days = (new Date(exp) - new Date()) / (1000 * 60 * 60 * 24);
      return days > 0 && days <= 90;
    }).length;
    const expired = features.filter(f => f.attributes.DriverStatus === "Expired").length;

    kpiEl.innerHTML = `
      <calcite-card class="kpi-card"><span class="kpi-value">${total}</span><span class="kpi-label">Total Drivers</span></calcite-card>
      <calcite-card class="kpi-card"><span class="kpi-value compliant">${active}</span><span class="kpi-label">Active</span></calcite-card>
      <calcite-card class="kpi-card"><span class="kpi-value atrisk">${expiring}</span><span class="kpi-label">Expiring (90d)</span></calcite-card>
      <calcite-card class="kpi-card"><span class="kpi-value noncompliant">${expired}</span><span class="kpi-label">Expired</span></calcite-card>
    `;
  }

  if (features.length === 0) {
    listEl.innerHTML = '<calcite-notice open icon="information" scale="s"><div slot="message">No drivers found.</div></calcite-notice>';
    return;
  }

  listEl.innerHTML = '<calcite-list selection-mode="single" id="driver-list-items"></calcite-list>';
  const list = listEl.querySelector("#driver-list-items");

  features.forEach(f => {
    const a = f.attributes;
    const displayName = a.DriverDisplayName || a.DriverName || a.DriverID;
    const statusClass = a.DriverStatus === "Active" ? "compliant" : a.DriverStatus === "Expired" ? "noncompliant" : "atrisk";

    const item = document.createElement("calcite-list-item");
    item.label = displayName;
    item.description = `${a.DriverType || ""} | ${a.IssuingAgency || ""} | ${a.PermitNumber || ""}`;
    item.value = a.DriverID;
    item.innerHTML = `<span slot="content-end" class="status-badge status-badge--${statusClass}">${a.DriverStatus || "Unknown"}</span>`;
    item.addEventListener("calciteListItemSelect", () => selectDriver(a.DriverID, f));
    list.appendChild(item);
  });
}

async function selectDriver(driverId, feature) {
  _selectedDriver = feature;
  const detail = _container.querySelector("#driver-detail");
  const driverList = _container.querySelector("#driver-list");
  if (detail) detail.hidden = false;
  if (driverList) driverList.hidden = true;

  const a = feature.attributes;
  const infoEl = _container.querySelector("#driver-info");
  if (infoEl) {
    const expDate = a.ExpirationDate ? new Date(a.ExpirationDate).toLocaleDateString() : "N/A";
    const issueDate = a.IssueDate ? new Date(a.IssueDate).toLocaleDateString() : "N/A";

    infoEl.innerHTML = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:0.85rem;">
        <div><strong>Driver ID:</strong> ${a.DriverID}</div>
        <div><strong>Type:</strong> ${a.DriverType || "N/A"}</div>
        <div><strong>Agency:</strong> ${a.IssuingAgency || "N/A"}</div>
        <div><strong>Permit #:</strong> ${a.PermitNumber || "N/A"}</div>
        <div><strong>Issue Date:</strong> ${issueDate}</div>
        <div><strong>Expiration:</strong> ${expDate}</div>
        <div><strong>Status:</strong> <span class="status-badge status-badge--${a.ComplianceStatus === "Compliant" ? "compliant" : "atrisk"}">${a.ComplianceStatus || a.DriverStatus}</span></div>
        <div><strong>Risk Score:</strong> ${a.RiskScore != null ? a.RiskScore.toFixed(1) : "N/A"}</div>
      </div>
      ${a.Description ? `<p class="text-sm text-muted mt-md">${a.Description}</p>` : ""}
    `;
  }

  // Load related data
  await Promise.all([
    loadDriverObligations(driverId),
    loadDriverAmendments(driverId),
    loadDriverPOCs(driverId),
    loadDriverDocuments(driverId),
  ]);
}

async function loadDriverObligations(driverId) {
  const el = _container.querySelector("#driver-obligations");
  if (!el) return;
  try {
    const url = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.OBLIGATIONS}/query`;
    const params = new URLSearchParams({ where: `DriverID='${driverId}'`, outFields: "*", f: "json" });
    const resp = await fetch(`${url}?${params}`);
    const data = await resp.json();
    const features = data.features || [];

    if (features.length === 0) {
      el.innerHTML = '<calcite-notice open icon="information" scale="s"><div slot="message">No obligations linked.</div></calcite-notice>';
      return;
    }

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

async function loadDriverAmendments(driverId) {
  const el = _container.querySelector("#driver-amendments");
  if (!el) return;
  try {
    const url = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.DRIVER_AMENDMENTS}/query`;
    const params = new URLSearchParams({ where: `DriverID='${driverId}'`, outFields: "*", orderByFields: "AmendmentDate DESC", f: "json" });
    const resp = await fetch(`${url}?${params}`);
    const data = await resp.json();
    const features = data.features || [];

    if (features.length === 0) {
      el.innerHTML = '<calcite-notice open icon="information" scale="s"><div slot="message">No amendments recorded.</div></calcite-notice>';
      return;
    }

    el.innerHTML = `
      <calcite-button id="add-amendment-btn" icon-start="plus" scale="s" appearance="outline" style="margin:8px 0;">Add Amendment</calcite-button>
      <div class="audit-table-wrap"><table class="audit-table">
        <thead><tr><th>Type</th><th>#</th><th>Date</th><th>Effective</th><th>Description</th></tr></thead>
        <tbody>${features.map(f => {
          const a = f.attributes;
          return `<tr>
            <td>${a.AmendmentType || ""}</td>
            <td>${a.AmendmentNumber || ""}</td>
            <td>${a.AmendmentDate ? new Date(a.AmendmentDate).toLocaleDateString() : ""}</td>
            <td>${a.EffectiveDate ? new Date(a.EffectiveDate).toLocaleDateString() : ""}</td>
            <td>${(a.Description || "").substring(0, 100)}</td>
          </tr>`;
        }).join("")}</tbody>
      </table></div>
    `;
  } catch (err) {
    el.innerHTML = '<calcite-notice open kind="danger"><div slot="message">Failed to load amendments.</div></calcite-notice>';
  }
}

async function loadDriverPOCs(driverId) {
  const el = _container.querySelector("#driver-pocs");
  if (!el) return;
  try {
    const url = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.DRIVER_POCS}/query`;
    const params = new URLSearchParams({ where: `DriverID='${driverId}'`, outFields: "*", f: "json" });
    const resp = await fetch(`${url}?${params}`);
    const data = await resp.json();
    const features = data.features || [];

    el.innerHTML = `
      <calcite-button id="add-poc-btn" icon-start="plus" scale="s" appearance="outline" style="margin:8px 0;">Add POC</calcite-button>
      ${features.length === 0 ? '<calcite-notice open icon="information" scale="s"><div slot="message">No POCs assigned.</div></calcite-notice>' : `
      <calcite-list>${features.map(f => {
        const a = f.attributes;
        return `<calcite-list-item label="${a.Organization || 'Unknown'}" description="${a.POCRole || ''} ${a.IsPrimary ? '(Primary)' : ''}"></calcite-list-item>`;
      }).join("")}</calcite-list>`}
    `;
  } catch (err) {
    el.innerHTML = '<calcite-notice open kind="danger"><div slot="message">Failed to load POCs.</div></calcite-notice>';
  }
}

async function loadDriverDocuments(driverId) {
  const el = _container.querySelector("#driver-documents");
  if (!el) return;
  try {
    const url = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.DOCUMENTS}/query`;
    const params = new URLSearchParams({ where: `DriverID='${driverId}'`, outFields: "*", orderByFields: "UploadDate DESC", f: "json" });
    const resp = await fetch(`${url}?${params}`);
    const data = await resp.json();
    const features = data.features || [];

    el.innerHTML = `
      <calcite-button id="add-driver-doc-btn" icon-start="plus" scale="s" appearance="outline" style="margin:8px 0;">Add Document</calcite-button>
      ${features.length === 0 ? '<calcite-notice open icon="information" scale="s"><div slot="message">No documents attached.</div></calcite-notice>' : `
      <calcite-list>${features.map(f => {
        const a = f.attributes;
        return `<calcite-list-item label="${a.DocumentName || ''}" description="DCN: ${a.DCN || 'N/A'} | Rev: ${a.Revision || '0'} | ${a.DocumentCategory || ''}">
          <calcite-action slot="actions-end" icon="download" text="Download"></calcite-action>
        </calcite-list-item>`;
      }).join("")}</calcite-list>`}
    `;
  } catch (err) {
    el.innerHTML = '<calcite-notice open kind="danger"><div slot="message">Failed to load documents.</div></calcite-notice>';
  }
}

function hideDriverDetail() {
  const detail = _container.querySelector("#driver-detail");
  const driverList = _container.querySelector("#driver-list");
  if (detail) detail.hidden = true;
  if (driverList) driverList.hidden = false;
  _selectedDriver = null;
}

function showDriverForm(driver = null) {
  // Dispatch event for app shell to handle form display
  const event = new CustomEvent("ecms-show-form", {
    detail: { formType: "driver", data: driver },
    bubbles: true
  });
  _container.dispatchEvent(event);
}

async function exportDrivers() {
  try {
    const url = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.DRIVERS}/query`;
    const params = new URLSearchParams({ where: "1=1", outFields: "*", f: "json" });
    const resp = await fetch(`${url}?${params}`);
    const data = await resp.json();
    const features = data.features || [];

    if (features.length === 0) return;

    const fields = ["DriverID", "DriverName", "DriverType", "IssuingAgency", "PermitNumber", "DriverStatus", "IssueDate", "ExpirationDate", "ComplianceStatus", "RiskScore"];
    const header = fields.join(",");
    const rows = features.map(f => fields.map(field => {
      let val = f.attributes[field] ?? "";
      if (typeof val === "string" && val.includes(",")) val = `"${val}"`;
      return val;
    }).join(","));

    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url2 = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url2;
    a.download = `drivers_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url2);
  } catch (err) {
    console.error("Export failed:", err);
  }
}

export function displaySearchResults(results) {
  renderDriverList(results);
}

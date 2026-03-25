/**
 * Transmittal Management Panel for ECMS.
 * Manages outgoing and incoming transmittals with linked document tracking.
 * @module js/transmittal-panel
 */

import { API, Fields, TransmittalDirection } from "../utils/constants.js";

let _container = null;
let _apiService = null;
let _selectedTransmittal = null;
let _currentTab = "all"; // "outgoing" | "incoming" | "all"

export function initialize(options = {}) {
  _container = options.container;
  _apiService = options.apiService;
  if (_container) render();
}

export async function refresh() {
  await loadTransmittals();
}

export async function loadTransmittals(filters = {}) {
  let where = "1=1";
  if (filters.projectId) where += ` AND ProjectID='${filters.projectId}'`;
  if (filters.status) where += ` AND TransmittalStatus='${filters.status}'`;
  if (filters.direction) where += ` AND Direction='${filters.direction}'`;
  if (filters.dateFrom) where += ` AND TransmittalDate>=${filters.dateFrom}`;
  if (filters.dateTo) where += ` AND TransmittalDate<=${filters.dateTo}`;

  try {
    const url = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.TRANSMITTALS}/query`;
    const params = new URLSearchParams({
      where,
      outFields: "*",
      orderByFields: "TransmittalDate DESC",
      f: "json"
    });
    const resp = await fetch(`${url}?${params}`);
    const data = await resp.json();
    renderTransmittalList(data.features || []);
  } catch (err) {
    console.error("Failed to load transmittals:", err);
  }
}

export function render() {
  if (!_container) return;
  _container.innerHTML = `
    <div class="panel-content">
      <div class="panel-header">
        <h3>Transmittals</h3>
        <div class="gap-sm" style="display:flex">
          <calcite-button id="add-transmittal-btn" icon-start="plus" scale="s" appearance="outline">
            New Transmittal
          </calcite-button>
          <calcite-button id="export-transmittals-btn" icon-start="download" scale="s" appearance="outline">
            Export
          </calcite-button>
        </div>
      </div>

      <!-- Direction Tabs -->
      <div style="padding:8px 12px;">
        <calcite-segmented-control id="transmittal-direction-toggle" scale="s" width="auto">
          <calcite-segmented-control-item value="all" checked>All</calcite-segmented-control-item>
          <calcite-segmented-control-item value="Outgoing">Outgoing</calcite-segmented-control-item>
          <calcite-segmented-control-item value="Incoming">Incoming</calcite-segmented-control-item>
        </calcite-segmented-control>
      </div>

      <!-- Filters -->
      <div style="padding:4px 12px; display:flex; gap:8px; flex-wrap:wrap;">
        <calcite-select id="transmittal-project-filter" scale="s" style="width:180px;">
          <calcite-option value="">All Projects</calcite-option>
        </calcite-select>
        <calcite-select id="transmittal-status-filter" scale="s" style="width:160px;">
          <calcite-option value="">All Statuses</calcite-option>
          <calcite-option value="Draft">Draft</calcite-option>
          <calcite-option value="Sent">Sent</calcite-option>
          <calcite-option value="Received">Received</calcite-option>
          <calcite-option value="Acknowledged">Acknowledged</calcite-option>
          <calcite-option value="AwaitingResponse">Awaiting Response</calcite-option>
          <calcite-option value="Closed">Closed</calcite-option>
        </calcite-select>
        <calcite-input id="transmittal-date-from" type="date" placeholder="From date" scale="s" style="width:150px;"></calcite-input>
        <calcite-input id="transmittal-date-to" type="date" placeholder="To date" scale="s" style="width:150px;"></calcite-input>
      </div>

      <!-- KPI Summary -->
      <div class="kpi-row" id="transmittal-kpis" style="padding:0 12px;"></div>

      <!-- Transmittal List -->
      <div id="transmittal-list" style="padding:0 12px;"></div>

      <!-- Transmittal Detail -->
      <div id="transmittal-detail" hidden>
        <calcite-panel heading="Transmittal Details" id="transmittal-detail-panel">
          <calcite-action slot="header-actions-end" icon="x" id="close-transmittal-detail" text="Close"></calcite-action>

          <!-- Transmittal Info -->
          <div id="transmittal-info" style="padding:12px;"></div>

          <!-- Linked Documents -->
          <div style="padding:0 12px;">
            <h4 style="font-size:0.85rem; margin-bottom:8px;">Linked Documents</h4>
            <div id="transmittal-documents"></div>
          </div>
        </calcite-panel>
      </div>
    </div>
  `;

  bindEvents();
  loadTransmittals();
}

function bindEvents() {
  const addBtn = _container.querySelector("#add-transmittal-btn");
  if (addBtn) addBtn.addEventListener("click", () => showTransmittalForm());

  const exportBtn = _container.querySelector("#export-transmittals-btn");
  if (exportBtn) exportBtn.addEventListener("click", () => exportTransmittals());

  const closeDetail = _container.querySelector("#close-transmittal-detail");
  if (closeDetail) closeDetail.addEventListener("click", () => hideTransmittalDetail());

  const directionToggle = _container.querySelector("#transmittal-direction-toggle");
  if (directionToggle) {
    directionToggle.addEventListener("calciteSegmentedControlChange", (e) => {
      const val = e.target.value || directionToggle.querySelector("[checked]")?.value || "all";
      _currentTab = val;
      applyFilters();
    });
  }

  ["transmittal-project-filter", "transmittal-status-filter"].forEach(id => {
    const el = _container.querySelector(`#${id}`);
    if (el) el.addEventListener("calciteSelectChange", () => applyFilters());
  });

  ["transmittal-date-from", "transmittal-date-to"].forEach(id => {
    const el = _container.querySelector(`#${id}`);
    if (el) el.addEventListener("calciteInputInput", () => applyFilters());
  });
}

function applyFilters() {
  const projectId = _container.querySelector("#transmittal-project-filter")?.value || "";
  const status = _container.querySelector("#transmittal-status-filter")?.value || "";
  const direction = _currentTab !== "all" ? _currentTab : "";
  const dateFromVal = _container.querySelector("#transmittal-date-from")?.value || "";
  const dateToVal = _container.querySelector("#transmittal-date-to")?.value || "";
  const dateFrom = dateFromVal ? new Date(dateFromVal).getTime() : "";
  const dateTo = dateToVal ? new Date(dateToVal).getTime() : "";
  loadTransmittals({ projectId, status, direction, dateFrom, dateTo });
}

function renderTransmittalList(features) {
  const listEl = _container.querySelector("#transmittal-list");
  if (!listEl) return;

  // KPIs
  const kpiEl = _container.querySelector("#transmittal-kpis");
  if (kpiEl) {
    const total = features.length;
    const pending = features.filter(f => f.attributes.TransmittalStatus === "Draft" || f.attributes.TransmittalStatus === "Sent").length;
    const awaiting = features.filter(f => f.attributes.TransmittalStatus === "AwaitingResponse").length;

    kpiEl.innerHTML = `
      <calcite-card class="kpi-card"><span class="kpi-value">${total}</span><span class="kpi-label">Total</span></calcite-card>
      <calcite-card class="kpi-card"><span class="kpi-value atrisk">${pending}</span><span class="kpi-label">Pending</span></calcite-card>
      <calcite-card class="kpi-card"><span class="kpi-value noncompliant">${awaiting}</span><span class="kpi-label">Awaiting Response</span></calcite-card>
    `;
  }

  if (features.length === 0) {
    listEl.innerHTML = '<calcite-notice open icon="information" scale="s"><div slot="message">No transmittals found.</div></calcite-notice>';
    return;
  }

  listEl.innerHTML = '<calcite-list selection-mode="single" id="transmittal-list-items"></calcite-list>';
  const list = listEl.querySelector("#transmittal-list-items");

  features.forEach(f => {
    const a = f.attributes;
    const direction = a.Direction || "Unknown";
    const dirIcon = direction === "Outgoing" ? "arrow-up-right" : direction === "Incoming" ? "arrow-down-left" : "arrow-right";
    const statusClass = a.TransmittalStatus === "Closed" || a.TransmittalStatus === "Acknowledged" ? "compliant"
      : a.TransmittalStatus === "AwaitingResponse" ? "noncompliant"
      : a.TransmittalStatus === "Sent" || a.TransmittalStatus === "Received" ? "atrisk"
      : "unknown";
    const date = a.TransmittalDate ? new Date(a.TransmittalDate).toLocaleDateString() : "N/A";

    const item = document.createElement("calcite-list-item");
    item.label = `${a.TransmittalNumber || "N/A"}: ${a.Subject || "No Subject"}`;
    item.description = `${direction} | ${date} | To: ${a.RecipientOrg || "N/A"}`;
    item.value = a.TransmittalID;
    item.innerHTML = `
      <calcite-icon slot="content-start" icon="${dirIcon}" scale="s"></calcite-icon>
      <span slot="content-end" class="status-badge status-badge--${statusClass}">${a.TransmittalStatus || "Unknown"}</span>
    `;
    item.addEventListener("calciteListItemSelect", () => selectTransmittal(a.TransmittalID, f));
    list.appendChild(item);
  });
}

export async function selectTransmittal(id, feature) {
  _selectedTransmittal = feature || null;

  if (!_selectedTransmittal) {
    try {
      const url = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.TRANSMITTALS}/query`;
      const params = new URLSearchParams({ where: `TransmittalID='${id}'`, outFields: "*", f: "json" });
      const resp = await fetch(`${url}?${params}`);
      const data = await resp.json();
      _selectedTransmittal = (data.features || [])[0];
    } catch (err) {
      console.error("Failed to fetch transmittal:", err);
      return;
    }
  }

  if (!_selectedTransmittal) return;

  const detail = _container.querySelector("#transmittal-detail");
  const transmittalList = _container.querySelector("#transmittal-list");
  if (detail) detail.hidden = false;
  if (transmittalList) transmittalList.hidden = true;

  const a = _selectedTransmittal.attributes;
  const infoEl = _container.querySelector("#transmittal-info");
  if (infoEl) {
    const txDate = a.TransmittalDate ? new Date(a.TransmittalDate).toLocaleDateString() : "N/A";
    const dueDate = a.ResponseDueDate ? new Date(a.ResponseDueDate).toLocaleDateString() : "N/A";
    const statusClass = a.TransmittalStatus === "Closed" ? "compliant"
      : a.TransmittalStatus === "AwaitingResponse" ? "noncompliant"
      : "atrisk";

    infoEl.innerHTML = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:0.85rem;">
        <div><strong>Transmittal #:</strong> ${a.TransmittalNumber || "N/A"}</div>
        <div><strong>Direction:</strong> ${a.Direction || "N/A"}</div>
        <div><strong>Status:</strong> <span class="status-badge status-badge--${statusClass}">${a.TransmittalStatus || "Unknown"}</span></div>
        <div><strong>Date:</strong> ${txDate}</div>
        <div><strong>Sender:</strong> ${a.SenderOrg || "N/A"}</div>
        <div><strong>Recipient:</strong> ${a.RecipientOrg || "N/A"}</div>
        <div><strong>Response Due:</strong> ${dueDate}</div>
        <div><strong>Project:</strong> ${a.ProjectID || "N/A"}</div>
        <div><strong>Tracking #:</strong> ${a.TrackingNumber || "N/A"}</div>
        <div><strong>Delivery Method:</strong> ${a.DeliveryMethod || "N/A"}</div>
      </div>
      ${a.Subject ? `<div style="margin-top:8px;"><strong>Subject:</strong> ${a.Subject}</div>` : ""}
      ${a.Notes ? `<p class="text-sm text-muted mt-md">${a.Notes}</p>` : ""}
    `;
  }

  await loadTransmittalDocuments(id);
}

async function loadTransmittalDocuments(transmittalId) {
  const el = _container.querySelector("#transmittal-documents");
  if (!el) return;
  try {
    // Query transmittal-document junction
    const junctionUrl = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.TRANSMITTAL_DOCUMENTS}/query`;
    const jParams = new URLSearchParams({ where: `TransmittalID='${transmittalId}'`, outFields: "DocumentID", f: "json" });
    const jResp = await fetch(`${junctionUrl}?${jParams}`);
    const jData = await jResp.json();
    const docIds = (jData.features || []).map(f => f.attributes.DocumentID);

    if (docIds.length === 0) {
      el.innerHTML = '<calcite-notice open icon="information" scale="s"><div slot="message">No documents linked to this transmittal.</div></calcite-notice>';
      return;
    }

    const idList = docIds.map(id => `'${id}'`).join(",");
    const docUrl = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.DOCUMENTS}/query`;
    const dParams = new URLSearchParams({ where: `DocumentID IN (${idList})`, outFields: "*", f: "json" });
    const dResp = await fetch(`${docUrl}?${dParams}`);
    const dData = await dResp.json();
    const features = dData.features || [];

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

function hideTransmittalDetail() {
  const detail = _container.querySelector("#transmittal-detail");
  const transmittalList = _container.querySelector("#transmittal-list");
  if (detail) detail.hidden = true;
  if (transmittalList) transmittalList.hidden = false;
  _selectedTransmittal = null;
}

function showTransmittalForm(transmittal = null) {
  const event = new CustomEvent("ecms-show-form", {
    detail: { formType: "transmittal", data: transmittal },
    bubbles: true
  });
  _container.dispatchEvent(event);
}

export async function exportTransmittals() {
  try {
    const url = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.TRANSMITTALS}/query`;
    const params = new URLSearchParams({ where: "1=1", outFields: "*", f: "json" });
    const resp = await fetch(`${url}?${params}`);
    const data = await resp.json();
    const features = data.features || [];

    if (features.length === 0) return;

    const fields = ["TransmittalID", "TransmittalNumber", "Direction", "TransmittalStatus", "Subject", "SenderOrg", "RecipientOrg", "TransmittalDate", "ResponseDueDate", "TrackingNumber", "ProjectID"];
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
    a.download = `transmittals_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(dlUrl);
  } catch (err) {
    console.error("Export failed:", err);
  }
}

export function displaySearchResults(results) {
  renderTransmittalList(results);
}

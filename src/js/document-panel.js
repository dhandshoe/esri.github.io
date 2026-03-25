/**
 * Document Library Panel for ECMS.
 * Manages document control including DCN tracking, revisions,
 * categories, and linked entities.
 * @module js/document-panel
 */

import { API, Fields } from "../utils/constants.js";

let _container = null;
let _apiService = null;
let _selectedDocument = null;

export function initialize(options = {}) {
  _container = options.container;
  _apiService = options.apiService;
  if (_container) render();
}

export async function refresh() {
  await loadDocuments();
}

export async function loadDocuments(filters = {}) {
  let where = "1=1";
  if (filters.projectId) where += ` AND ProjectID='${filters.projectId}'`;
  if (filters.category) where += ` AND DocumentCategory='${filters.category}'`;
  if (filters.status) where += ` AND DocumentStatus='${filters.status}'`;

  try {
    const url = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.DOCUMENTS}/query`;
    const params = new URLSearchParams({
      where,
      outFields: "*",
      orderByFields: "DocumentName ASC",
      f: "json"
    });
    const resp = await fetch(`${url}?${params}`);
    const data = await resp.json();
    renderDocumentList(data.features || []);
  } catch (err) {
    console.error("Failed to load documents:", err);
  }
}

export function render() {
  if (!_container) return;
  _container.innerHTML = `
    <div class="panel-content">
      <div class="panel-header">
        <h3>Document Library</h3>
        <div class="gap-sm" style="display:flex">
          <calcite-button id="add-document-btn" icon-start="plus" scale="s" appearance="outline">
            Add Document
          </calcite-button>
          <calcite-button id="export-documents-btn" icon-start="download" scale="s" appearance="outline">
            Export
          </calcite-button>
        </div>
      </div>

      <!-- Filters -->
      <div style="padding:8px 12px; display:flex; gap:8px; flex-wrap:wrap;">
        <calcite-select id="document-project-filter" scale="s" style="width:180px;">
          <calcite-option value="">All Projects</calcite-option>
        </calcite-select>
        <calcite-select id="document-category-filter" scale="s" style="width:160px;">
          <calcite-option value="">All Categories</calcite-option>
          <calcite-option value="Permit">Permit</calcite-option>
          <calcite-option value="Plan">Plan</calcite-option>
          <calcite-option value="Report">Report</calcite-option>
          <calcite-option value="Correspondence">Correspondence</calcite-option>
          <calcite-option value="Drawing">Drawing</calcite-option>
          <calcite-option value="Specification">Specification</calcite-option>
          <calcite-option value="Procedure">Procedure</calcite-option>
          <calcite-option value="Other">Other</calcite-option>
        </calcite-select>
        <calcite-select id="document-status-filter" scale="s" style="width:140px;">
          <calcite-option value="">All Statuses</calcite-option>
          <calcite-option value="Active">Active</calcite-option>
          <calcite-option value="InReview">In Review</calcite-option>
          <calcite-option value="PendingSubmission">Pending Submission</calcite-option>
          <calcite-option value="Superseded">Superseded</calcite-option>
          <calcite-option value="Archived">Archived</calcite-option>
        </calcite-select>
        <calcite-input id="document-search" placeholder="Search by name or DCN..." icon="search" scale="s" clearable style="width:220px;"></calcite-input>
      </div>

      <!-- KPI Summary -->
      <div class="kpi-row" id="document-kpis" style="padding:0 12px;"></div>

      <!-- Document List -->
      <div id="document-list" style="padding:0 12px;"></div>

      <!-- Document Detail -->
      <div id="document-detail" hidden>
        <calcite-panel heading="Document Details" id="document-detail-panel">
          <calcite-action slot="header-actions-end" icon="x" id="close-document-detail" text="Close"></calcite-action>

          <!-- Document Info -->
          <div id="document-info" style="padding:12px;"></div>

          <!-- Tabs for revision history and linked entities -->
          <calcite-tabs>
            <calcite-tab-nav slot="title-group">
              <calcite-tab-title selected>Revision History</calcite-tab-title>
              <calcite-tab-title>Linked Entities</calcite-tab-title>
            </calcite-tab-nav>
            <calcite-tab selected><div id="document-revisions"></div></calcite-tab>
            <calcite-tab><div id="document-linked-entities"></div></calcite-tab>
          </calcite-tabs>
        </calcite-panel>
      </div>
    </div>
  `;

  bindEvents();
  loadDocuments();
}

function bindEvents() {
  const addBtn = _container.querySelector("#add-document-btn");
  if (addBtn) addBtn.addEventListener("click", () => showDocumentForm());

  const exportBtn = _container.querySelector("#export-documents-btn");
  if (exportBtn) exportBtn.addEventListener("click", () => exportDocuments());

  const closeDetail = _container.querySelector("#close-document-detail");
  if (closeDetail) closeDetail.addEventListener("click", () => hideDocumentDetail());

  ["document-project-filter", "document-category-filter", "document-status-filter"].forEach(id => {
    const el = _container.querySelector(`#${id}`);
    if (el) el.addEventListener("calciteSelectChange", () => applyFilters());
  });

  const searchInput = _container.querySelector("#document-search");
  if (searchInput) {
    let timer;
    searchInput.addEventListener("calciteInputInput", () => {
      clearTimeout(timer);
      timer = setTimeout(() => applyFilters(), 300);
    });
  }
}

function applyFilters() {
  const projectId = _container.querySelector("#document-project-filter")?.value || "";
  const category = _container.querySelector("#document-category-filter")?.value || "";
  const status = _container.querySelector("#document-status-filter")?.value || "";
  loadDocuments({ projectId, category, status });
}

function renderDocumentList(features) {
  const listEl = _container.querySelector("#document-list");
  if (!listEl) return;

  // KPIs
  const kpiEl = _container.querySelector("#document-kpis");
  if (kpiEl) {
    const total = features.length;
    const active = features.filter(f => f.attributes.DocumentStatus === "Active").length;
    const inReview = features.filter(f => f.attributes.DocumentStatus === "InReview").length;
    const pending = features.filter(f => f.attributes.DocumentStatus === "PendingSubmission").length;

    kpiEl.innerHTML = `
      <calcite-card class="kpi-card"><span class="kpi-value">${total}</span><span class="kpi-label">Total Documents</span></calcite-card>
      <calcite-card class="kpi-card"><span class="kpi-value compliant">${active}</span><span class="kpi-label">Active</span></calcite-card>
      <calcite-card class="kpi-card"><span class="kpi-value atrisk">${inReview}</span><span class="kpi-label">In Review</span></calcite-card>
      <calcite-card class="kpi-card"><span class="kpi-value noncompliant">${pending}</span><span class="kpi-label">Pending Submission</span></calcite-card>
    `;
  }

  if (features.length === 0) {
    listEl.innerHTML = '<calcite-notice open icon="information" scale="s"><div slot="message">No documents found.</div></calcite-notice>';
    return;
  }

  listEl.innerHTML = '<calcite-list selection-mode="single" id="document-list-items"></calcite-list>';
  const list = listEl.querySelector("#document-list-items");

  features.forEach(f => {
    const a = f.attributes;
    const statusClass = a.DocumentStatus === "Active" ? "compliant"
      : a.DocumentStatus === "InReview" ? "atrisk"
      : a.DocumentStatus === "PendingSubmission" ? "noncompliant"
      : "unknown";

    const item = document.createElement("calcite-list-item");
    item.label = a.DocumentName || "Untitled Document";
    item.description = `DCN: ${a.DCN || "N/A"} | Rev: ${a.Revision || "0"} | ${a.DocumentCategory || "Uncategorized"}`;
    item.value = a.DocumentID;
    item.innerHTML = `<span slot="content-end" class="status-badge status-badge--${statusClass}">${a.DocumentStatus || "Unknown"}</span>`;
    item.addEventListener("calciteListItemSelect", () => selectDocument(a.DocumentID, f));
    list.appendChild(item);
  });
}

export async function selectDocument(id, feature) {
  _selectedDocument = feature || null;

  if (!_selectedDocument) {
    try {
      const url = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.DOCUMENTS}/query`;
      const params = new URLSearchParams({ where: `DocumentID='${id}'`, outFields: "*", f: "json" });
      const resp = await fetch(`${url}?${params}`);
      const data = await resp.json();
      _selectedDocument = (data.features || [])[0];
    } catch (err) {
      console.error("Failed to fetch document:", err);
      return;
    }
  }

  if (!_selectedDocument) return;

  const detail = _container.querySelector("#document-detail");
  const docList = _container.querySelector("#document-list");
  if (detail) detail.hidden = false;
  if (docList) docList.hidden = true;

  const a = _selectedDocument.attributes;
  const infoEl = _container.querySelector("#document-info");
  if (infoEl) {
    const uploadDate = a.UploadDate ? new Date(a.UploadDate).toLocaleDateString() : "N/A";
    const reviewDate = a.ReviewDate ? new Date(a.ReviewDate).toLocaleDateString() : "N/A";
    const statusClass = a.DocumentStatus === "Active" ? "compliant"
      : a.DocumentStatus === "InReview" ? "atrisk"
      : "unknown";

    infoEl.innerHTML = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:0.85rem;">
        <div><strong>Document ID:</strong> ${a.DocumentID}</div>
        <div><strong>DCN:</strong> ${a.DCN || "N/A"}</div>
        <div><strong>Category:</strong> ${a.DocumentCategory || "N/A"}</div>
        <div><strong>Revision:</strong> ${a.Revision || "0"}</div>
        <div><strong>Upload Date:</strong> ${uploadDate}</div>
        <div><strong>Review Date:</strong> ${reviewDate}</div>
        <div><strong>Status:</strong> <span class="status-badge status-badge--${statusClass}">${a.DocumentStatus || "Unknown"}</span></div>
        <div><strong>Author:</strong> ${a.Author || "N/A"}</div>
        <div><strong>Project:</strong> ${a.ProjectID || "N/A"}</div>
        <div><strong>File Type:</strong> ${a.FileType || "N/A"}</div>
      </div>
      ${a.Description ? `<p class="text-sm text-muted mt-md">${a.Description}</p>` : ""}
    `;
  }

  await Promise.all([
    loadDocumentHistory(id),
    loadDocumentLinkedEntities(a),
  ]);
}

export async function loadDocumentHistory(documentId) {
  const el = _container.querySelector("#document-revisions");
  if (!el) return;
  try {
    // Query all revisions by DCN to get full history
    const docUrl = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.DOCUMENTS}/query`;
    const dParams = new URLSearchParams({ where: `DocumentID='${documentId}'`, outFields: "DCN", f: "json" });
    const dResp = await fetch(`${docUrl}?${dParams}`);
    const dData = await dResp.json();
    const dcn = (dData.features || [])[0]?.attributes?.DCN;

    if (!dcn) {
      el.innerHTML = '<calcite-notice open icon="information" scale="s"><div slot="message">No revision history available.</div></calcite-notice>';
      return;
    }

    const url = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.DOCUMENTS}/query`;
    const params = new URLSearchParams({ where: `DCN='${dcn}'`, outFields: "*", orderByFields: "Revision DESC", f: "json" });
    const resp = await fetch(`${url}?${params}`);
    const data = await resp.json();
    const features = data.features || [];

    if (features.length <= 1) {
      el.innerHTML = '<calcite-notice open icon="information" scale="s"><div slot="message">This is the only revision.</div></calcite-notice>';
      return;
    }

    el.innerHTML = `
      <div class="audit-table-wrap"><table class="audit-table">
        <thead><tr><th>Rev</th><th>Date</th><th>Author</th><th>Status</th><th>Description</th></tr></thead>
        <tbody>${features.map(f => {
          const a = f.attributes;
          const date = a.UploadDate ? new Date(a.UploadDate).toLocaleDateString() : "N/A";
          return `<tr>
            <td>${a.Revision || "0"}</td>
            <td>${date}</td>
            <td>${a.Author || "N/A"}</td>
            <td>${a.DocumentStatus || "N/A"}</td>
            <td>${(a.RevisionNotes || a.Description || "").substring(0, 100)}</td>
          </tr>`;
        }).join("")}</tbody>
      </table></div>
    `;
  } catch (err) {
    el.innerHTML = '<calcite-notice open kind="danger"><div slot="message">Failed to load revision history.</div></calcite-notice>';
  }
}

async function loadDocumentLinkedEntities(attributes) {
  const el = _container.querySelector("#document-linked-entities");
  if (!el) return;

  const sections = [];

  // Linked Driver
  if (attributes.DriverID) {
    try {
      const url = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.DRIVERS}/query`;
      const params = new URLSearchParams({ where: `DriverID='${attributes.DriverID}'`, outFields: "DriverID,DriverName,DriverDisplayName,DriverStatus", f: "json" });
      const resp = await fetch(`${url}?${params}`);
      const data = await resp.json();
      const driver = (data.features || [])[0]?.attributes;
      if (driver) {
        sections.push(`<div style="margin-bottom:12px;">
          <h4 style="font-size:0.85rem; margin-bottom:4px;">Linked Driver</h4>
          <calcite-list><calcite-list-item label="${driver.DriverDisplayName || driver.DriverName || driver.DriverID}" description="Status: ${driver.DriverStatus || 'N/A'}"></calcite-list-item></calcite-list>
        </div>`);
      }
    } catch (err) { /* skip */ }
  }

  // Linked Obligation
  if (attributes.ObligationID) {
    try {
      const url = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.OBLIGATIONS}/query`;
      const params = new URLSearchParams({ where: `ObligationID='${attributes.ObligationID}'`, outFields: "ObligationID,ObligationNumber,ObligationName,ObligationStatus", f: "json" });
      const resp = await fetch(`${url}?${params}`);
      const data = await resp.json();
      const obl = (data.features || [])[0]?.attributes;
      if (obl) {
        sections.push(`<div style="margin-bottom:12px;">
          <h4 style="font-size:0.85rem; margin-bottom:4px;">Linked Obligation</h4>
          <calcite-list><calcite-list-item label="${obl.ObligationNumber}: ${obl.ObligationName || ''}" description="Status: ${obl.ObligationStatus || 'N/A'}"></calcite-list-item></calcite-list>
        </div>`);
      }
    } catch (err) { /* skip */ }
  }

  // Linked Task
  if (attributes.TaskID) {
    try {
      const url = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.TASKS}/query`;
      const params = new URLSearchParams({ where: `TaskID='${attributes.TaskID}'`, outFields: "TaskID,TaskName,TaskStatus", f: "json" });
      const resp = await fetch(`${url}?${params}`);
      const data = await resp.json();
      const task = (data.features || [])[0]?.attributes;
      if (task) {
        sections.push(`<div style="margin-bottom:12px;">
          <h4 style="font-size:0.85rem; margin-bottom:4px;">Linked Task</h4>
          <calcite-list><calcite-list-item label="${task.TaskName || task.TaskID}" description="Status: ${task.TaskStatus || 'N/A'}"></calcite-list-item></calcite-list>
        </div>`);
      }
    } catch (err) { /* skip */ }
  }

  el.innerHTML = sections.length > 0
    ? sections.join("")
    : '<calcite-notice open icon="information" scale="s"><div slot="message">No linked entities.</div></calcite-notice>';
}

function hideDocumentDetail() {
  const detail = _container.querySelector("#document-detail");
  const docList = _container.querySelector("#document-list");
  if (detail) detail.hidden = true;
  if (docList) docList.hidden = false;
  _selectedDocument = null;
}

function showDocumentForm(doc = null) {
  const event = new CustomEvent("ecms-show-form", {
    detail: { formType: "document", data: doc },
    bubbles: true
  });
  _container.dispatchEvent(event);
}

export async function exportDocuments() {
  try {
    const url = `${API.FEATURE_SERVICE_URL}/${API.LAYERS.DOCUMENTS}/query`;
    const params = new URLSearchParams({ where: "1=1", outFields: "*", f: "json" });
    const resp = await fetch(`${url}?${params}`);
    const data = await resp.json();
    const features = data.features || [];

    if (features.length === 0) return;

    const fields = ["DocumentID", "DocumentName", "DCN", "Revision", "DocumentCategory", "DocumentStatus", "Author", "UploadDate", "ProjectID", "DriverID", "ObligationID"];
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
    a.download = `documents_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(dlUrl);
  } catch (err) {
    console.error("Export failed:", err);
  }
}

export function displaySearchResults(results) {
  renderDocumentList(results);
}

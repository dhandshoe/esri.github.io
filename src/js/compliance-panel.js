/**
 * Compliance management UI panel: permit list, conditions editor, trigger config, history.
 * @module js/compliance-panel
 */

import { ComplianceStatus, ComplianceStatusLabels, PermitType, PermitTypeLabels, Fields, Operator, OperatorLabels, API } from "../utils/constants.js";
import * as apiService from "../services/api-service.js";
import { runServerComplianceCheck, quickEvaluatePermit, generateComplianceSummary } from "../services/compliance-service.js";
import { zoomTo, getLayer, refreshLayer } from "./map-manager.js";

// ---------------------------------------------------------------------------
// Module State
// ---------------------------------------------------------------------------

let _container = null;
let _permits = [];
let _selectedPermit = null;
let _filters = { status: "", type: "", agency: "", search: "" };

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Initialize the compliance panel.
 * @param {HTMLElement} container - The DOM element to render into.
 */
export function init(container) {
  _container = container;
  render();
}

/**
 * Render the full compliance panel markup.
 */
function render() {
  if (!_container) return;

  _container.innerHTML = `
    <div class="ecms-panel active" id="compliance-panel-inner">
      <!-- Summary Cards -->
      <div class="panel-header">
        <h3>Compliance Overview</h3>
        <calcite-button id="btn-run-check" icon-start="check-circle" appearance="outline" scale="s">
          Run Check Now
        </calcite-button>
      </div>
      <div class="panel-content">
        <div class="kpi-row" id="compliance-kpi-row"></div>

        <!-- Filters -->
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
          <calcite-select id="filter-status" label="Status" scale="s" width="auto">
            <calcite-option value="">All Statuses</calcite-option>
            ${Object.entries(ComplianceStatusLabels).map(([k, v]) => `<calcite-option value="${k}">${v}</calcite-option>`).join("")}
          </calcite-select>
          <calcite-select id="filter-type" label="Type" scale="s" width="auto">
            <calcite-option value="">All Types</calcite-option>
            ${Object.entries(PermitTypeLabels).map(([k, v]) => `<calcite-option value="${k}">${v}</calcite-option>`).join("")}
          </calcite-select>
          <calcite-input id="filter-search" placeholder="Search permits..." scale="s" icon="search"
            clearable type="search" style="max-width:220px;">
          </calcite-input>
        </div>

        <!-- Permit List -->
        <calcite-list id="permit-list" selection-mode="single" loading></calcite-list>

        <!-- Condition Editor (hidden until permit selected) -->
        <div id="condition-section" style="display:none;" class="mt-lg">
          <div class="panel-header">
            <h3>Conditions for <span id="cond-permit-label"></span></h3>
            <calcite-button id="btn-add-condition" icon-start="plus" appearance="outline" scale="s">
              Add Condition
            </calcite-button>
          </div>
          <calcite-list id="condition-list"></calcite-list>
        </div>

        <!-- Compliance History (hidden until permit selected) -->
        <div id="history-section" style="display:none;" class="mt-lg">
          <div class="panel-header">
            <h3>Compliance History</h3>
            <calcite-button id="btn-export-report" icon-start="file-report" appearance="outline" scale="s">
              Export Report
            </calcite-button>
          </div>
          <calcite-list id="history-list"></calcite-list>
        </div>
      </div>
    </div>
  `;

  bindEvents();
  loadPermits();
}

// ---------------------------------------------------------------------------
// Event Binding
// ---------------------------------------------------------------------------

function bindEvents() {
  _container.querySelector("#filter-status")?.addEventListener("calciteSelectChange", (e) => {
    _filters.status = e.target.value;
    loadPermits();
  });
  _container.querySelector("#filter-type")?.addEventListener("calciteSelectChange", (e) => {
    _filters.type = e.target.value;
    loadPermits();
  });
  _container.querySelector("#filter-search")?.addEventListener("calciteInputInput", (e) => {
    _filters.search = e.target.value;
    loadPermits();
  });
  _container.querySelector("#btn-run-check")?.addEventListener("click", handleRunCheck);
  _container.querySelector("#btn-add-condition")?.addEventListener("click", handleAddCondition);
  _container.querySelector("#btn-export-report")?.addEventListener("click", handleExportReport);
  _container.querySelector("#permit-list")?.addEventListener("calciteListChange", handlePermitSelect);
}

// ---------------------------------------------------------------------------
// Data Loading
// ---------------------------------------------------------------------------

/**
 * Load permits from the API with current filters.
 */
async function loadPermits() {
  const list = _container.querySelector("#permit-list");
  if (!list) return;
  list.loading = true;

  try {
    _permits = await apiService.queryPermits(_filters);
    renderPermitList(_permits);
    renderKPICards(_permits);
  } catch (err) {
    console.error("Failed to load permits:", err);
    list.innerHTML = `<calcite-notice open icon="exclamation-mark-triangle" kind="danger" scale="s">
      <div slot="message">Failed to load permits: ${err.message}</div>
    </calcite-notice>`;
  } finally {
    list.loading = false;
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderPermitList(permits) {
  const list = _container.querySelector("#permit-list");
  if (!list) return;

  if (!permits.length) {
    list.innerHTML = `<calcite-notice open icon="information" kind="brand" scale="s">
      <div slot="message">No permits match the current filters.</div>
    </calcite-notice>`;
    return;
  }

  list.innerHTML = permits.map((p) => {
    const a = p.attributes;
    const status = a[Fields.COMPLIANCE_STATUS] || ComplianceStatus.UNKNOWN;
    const statusLabel = ComplianceStatusLabels[status] || status;
    const statusClass = status.toLowerCase().replace(/_/g, "");
    const risk = a[Fields.RISK_SCORE] ?? 0;

    return `
      <calcite-list-item
        value="${a[Fields.OBJECTID]}"
        label="${a[Fields.PERMIT_NAME] || 'Unnamed Permit'}"
        description="${a[Fields.PERMIT_ID]} | ${PermitTypeLabels[a[Fields.PERMIT_TYPE]] || a[Fields.PERMIT_TYPE] || 'N/A'} | Risk: ${risk}"
        data-oid="${a[Fields.OBJECTID]}"
      >
        <span slot="content-end" class="status-badge status-badge--${statusClass}">${statusLabel}</span>
      </calcite-list-item>
    `;
  }).join("");
}

function renderKPICards(permits) {
  const row = _container.querySelector("#compliance-kpi-row");
  if (!row) return;

  const summary = generateComplianceSummary(permits);

  row.innerHTML = `
    <calcite-card class="kpi-card">
      <div class="kpi-value">${summary.total}</div>
      <div class="kpi-label">Total Permits</div>
    </calcite-card>
    <calcite-card class="kpi-card">
      <div class="kpi-value compliant">${summary.percentCompliant}%</div>
      <div class="kpi-label">Compliant</div>
    </calcite-card>
    <calcite-card class="kpi-card">
      <div class="kpi-value noncompliant">${summary.activeViolations}</div>
      <div class="kpi-label">Violations</div>
    </calcite-card>
    <calcite-card class="kpi-card">
      <div class="kpi-value atrisk">${summary.byCounts[ComplianceStatus.AT_RISK] || 0}</div>
      <div class="kpi-label">At Risk</div>
    </calcite-card>
    <calcite-card class="kpi-card">
      <div class="kpi-value">${summary.avgRiskScore}</div>
      <div class="kpi-label">Avg Risk Score</div>
    </calcite-card>
  `;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handlePermitSelect(event) {
  const list = event.target;
  const selected = list.selectedItems?.[0];
  if (!selected) return;

  const oid = Number(selected.dataset.oid || selected.value);
  _selectedPermit = _permits.find((p) => p.attributes[Fields.OBJECTID] === oid);

  if (!_selectedPermit) return;

  const permitId = _selectedPermit.attributes[Fields.PERMIT_ID];

  // Zoom to feature
  if (_selectedPermit.geometry) {
    zoomTo(_selectedPermit);
  }

  // Show conditions section
  _container.querySelector("#condition-section").style.display = "block";
  _container.querySelector("#cond-permit-label").textContent = permitId;
  await loadConditions(permitId);

  // Show history section
  _container.querySelector("#history-section").style.display = "block";
  await loadHistory(permitId);
}

async function loadConditions(permitId) {
  const list = _container.querySelector("#condition-list");
  if (!list) return;
  list.loading = true;

  try {
    const conditions = await apiService.getConditionsForPermit(permitId);
    if (!conditions.length) {
      list.innerHTML = `<calcite-notice open kind="brand" scale="s"><div slot="message">No conditions found.</div></calcite-notice>`;
    } else {
      list.innerHTML = conditions.map((c) => {
        const ca = c.attributes;
        return `
          <calcite-list-item
            label="${ca[Fields.CONDITION_ID]}"
            description="${ca[Fields.CONDITION_TEXT] || ''}"
            data-oid="${ca[Fields.OBJECTID]}"
          >
            <calcite-action slot="actions-end" icon="pencil" text="Edit" data-action="edit-condition" data-oid="${ca[Fields.OBJECTID]}"></calcite-action>
            <calcite-action slot="actions-end" icon="trash" text="Delete" data-action="delete-condition" data-oid="${ca[Fields.OBJECTID]}"></calcite-action>
            <calcite-action slot="actions-end" icon="bolt" text="Triggers" data-action="view-triggers" data-cid="${ca[Fields.CONDITION_ID]}"></calcite-action>
          </calcite-list-item>
        `;
      }).join("");

      // Bind inline actions
      list.querySelectorAll("calcite-action[data-action='delete-condition']").forEach((btn) => {
        btn.addEventListener("click", () => handleDeleteCondition(Number(btn.dataset.oid)));
      });
      list.querySelectorAll("calcite-action[data-action='edit-condition']").forEach((btn) => {
        btn.addEventListener("click", () => handleEditCondition(Number(btn.dataset.oid)));
      });
      list.querySelectorAll("calcite-action[data-action='view-triggers']").forEach((btn) => {
        btn.addEventListener("click", () => handleViewTriggers(btn.dataset.cid));
      });
    }
  } catch (err) {
    list.innerHTML = `<calcite-notice open kind="danger" scale="s"><div slot="message">${err.message}</div></calcite-notice>`;
  } finally {
    list.loading = false;
  }
}

async function loadHistory(permitId) {
  const list = _container.querySelector("#history-list");
  if (!list) return;

  try {
    const entries = await apiService.queryAuditLog({ recordId: permitId });
    if (!entries.length) {
      list.innerHTML = `<calcite-notice open kind="brand" scale="s"><div slot="message">No history found.</div></calcite-notice>`;
      return;
    }

    // Group by date
    const grouped = {};
    for (const e of entries) {
      const a = e.attributes;
      const d = new Date(a[Fields.AUDIT_DATE]);
      const key = d.toLocaleDateString();
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(a);
    }

    let html = "";
    for (const [date, items] of Object.entries(grouped)) {
      html += `<calcite-list-item-group heading="${date}">`;
      for (const item of items) {
        const action = item[Fields.AUDIT_ACTION] || "Update";
        const field = item[Fields.AUDIT_FIELD] || "";
        const oldVal = item[Fields.AUDIT_OLD_VALUE] || "";
        const newVal = item[Fields.AUDIT_NEW_VALUE] || "";
        html += `
          <calcite-list-item
            label="${action}: ${field}"
            description="${oldVal ? oldVal + ' → ' : ''}${newVal} — by ${item[Fields.AUDIT_USER] || 'System'}"
          ></calcite-list-item>
        `;
      }
      html += `</calcite-list-item-group>`;
    }
    list.innerHTML = html;
  } catch (err) {
    list.innerHTML = `<calcite-notice open kind="danger" scale="s"><div slot="message">${err.message}</div></calcite-notice>`;
  }
}

async function handleRunCheck() {
  const btn = _container.querySelector("#btn-run-check");
  btn.loading = true;

  try {
    const permitId = _selectedPermit?.attributes?.[Fields.PERMIT_ID];
    await runServerComplianceCheck(permitId || undefined);
    refreshLayer("permits");
    await loadPermits();
    showNotice("Compliance check completed successfully.", "success");
  } catch (err) {
    console.error("Compliance check failed:", err);
    showNotice(`Compliance check failed: ${err.message}`, "danger");
  } finally {
    btn.loading = false;
  }
}

function handleAddCondition() {
  const event = new CustomEvent("ecms-open-dialog", {
    bubbles: true,
    detail: {
      dialog: "add-condition",
      permitId: _selectedPermit?.attributes?.[Fields.PERMIT_ID],
      onSave: () => {
        const pid = _selectedPermit?.attributes?.[Fields.PERMIT_ID];
        if (pid) loadConditions(pid);
      },
    },
  });
  document.dispatchEvent(event);
}

function handleEditCondition(objectId) {
  const event = new CustomEvent("ecms-open-dialog", {
    bubbles: true,
    detail: {
      dialog: "add-condition",
      objectId,
      permitId: _selectedPermit?.attributes?.[Fields.PERMIT_ID],
      onSave: () => {
        const pid = _selectedPermit?.attributes?.[Fields.PERMIT_ID];
        if (pid) loadConditions(pid);
      },
    },
  });
  document.dispatchEvent(event);
}

async function handleDeleteCondition(objectId) {
  if (!confirm("Delete this condition? This cannot be undone.")) return;
  try {
    await apiService.deleteFeatures(API.LAYERS.CONDITIONS, [objectId]);
    const pid = _selectedPermit?.attributes?.[Fields.PERMIT_ID];
    if (pid) loadConditions(pid);
    showNotice("Condition deleted.", "success");
  } catch (err) {
    showNotice(`Delete failed: ${err.message}`, "danger");
  }
}

function handleViewTriggers(conditionId) {
  const event = new CustomEvent("ecms-open-dialog", {
    bubbles: true,
    detail: { dialog: "configure-trigger", conditionId },
  });
  document.dispatchEvent(event);
}

/**
 * Export a compliance report as CSV.
 */
function handleExportReport() {
  exportComplianceReport(_permits);
}

/**
 * Generate and download a CSV compliance report.
 * @param {Array} permits
 */
export function exportComplianceReport(permits) {
  const headers = ["PermitID", "PermitName", "Type", "Status", "RiskScore", "IssueDate", "ExpirationDate", "Agency"];
  const rows = permits.map((p) => {
    const a = p.attributes;
    return [
      a[Fields.PERMIT_ID],
      a[Fields.PERMIT_NAME],
      a[Fields.PERMIT_TYPE],
      a[Fields.COMPLIANCE_STATUS],
      a[Fields.RISK_SCORE],
      a[Fields.ISSUE_DATE] ? new Date(a[Fields.ISSUE_DATE]).toLocaleDateString() : "",
      a[Fields.EXPIRATION_DATE] ? new Date(a[Fields.EXPIRATION_DATE]).toLocaleDateString() : "",
      a[Fields.ISSUING_AGENCY],
    ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",");
  });

  const csv = [headers.join(","), ...rows].join("\n");
  downloadFile("compliance-report.csv", csv, "text/csv");
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function showNotice(message, kind = "brand") {
  const notice = document.createElement("calcite-alert");
  notice.setAttribute("open", "");
  notice.setAttribute("kind", kind);
  notice.setAttribute("auto-close", "");
  notice.setAttribute("auto-close-duration", "medium");
  notice.setAttribute("icon", kind === "danger" ? "exclamation-mark-triangle" : "check-circle");
  notice.innerHTML = `<div slot="message">${message}</div>`;
  document.body.appendChild(notice);
  setTimeout(() => notice.remove(), 6000);
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Refresh the panel data externally.
 */
export function refresh() {
  loadPermits();
}

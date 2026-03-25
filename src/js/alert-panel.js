/**
 * Alert management panel: active alerts, detail view, acknowledge/resolve, contacts, history.
 * @module js/alert-panel
 */

import { AlertSeverity, AlertSeverityIcons, SeverityColors, Fields, API } from "../utils/constants.js";
import * as apiService from "../services/api-service.js";
import { zoomTo, getLayer, highlightFeatures } from "./map-manager.js";

// ---------------------------------------------------------------------------
// Module State
// ---------------------------------------------------------------------------

let _container = null;
let _alerts = [];
let _selectedAlert = null;
let _highlightHandle = null;
let _historyFilter = { severity: "", status: "" };

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Initialize the alert panel.
 * @param {HTMLElement} container
 */
export function init(container) {
  _container = container;
  render();
}

/**
 * Render the full alert panel markup.
 */
function render() {
  if (!_container) return;

  _container.innerHTML = `
    <div class="ecms-panel active" id="alert-panel-inner">
      <div class="panel-header">
        <h3>Alerts</h3>
        <div style="display:flex;gap:6px;">
          <calcite-button id="btn-manage-contacts" icon-start="user-group" appearance="outline" scale="s">
            Contacts
          </calcite-button>
          <calcite-button id="btn-alert-history" icon-start="clock" appearance="outline" scale="s">
            History
          </calcite-button>
        </div>
      </div>
      <div class="panel-content">
        <!-- Active Alerts -->
        <calcite-list id="alert-list" selection-mode="single" loading></calcite-list>

        <!-- Alert Detail (shown on select) -->
        <div id="alert-detail" style="display:none;" class="mt-lg">
          <calcite-card id="alert-detail-card">
            <span slot="heading" id="alert-detail-heading"></span>
            <span slot="description" id="alert-detail-desc"></span>
            <div id="alert-detail-body" style="padding:8px 0;font-size:0.85rem;"></div>
            <div slot="footer-start" style="display:flex;gap:6px;">
              <calcite-button id="btn-ack-alert" icon-start="check" appearance="outline" scale="s">Acknowledge</calcite-button>
              <calcite-button id="btn-resolve-alert" icon-start="check-circle-f" kind="brand" scale="s">Resolve</calcite-button>
            </div>
            <div slot="footer-end">
              <calcite-chip id="alert-escalation-chip" scale="s" icon="arrow-up"></calcite-chip>
            </div>
          </calcite-card>
        </div>

        <!-- Alert History (hidden by default) -->
        <div id="alert-history-section" style="display:none;" class="mt-lg">
          <div class="panel-header">
            <h3>Alert History</h3>
          </div>
          <div style="display:flex;gap:8px;margin:8px 0;">
            <calcite-select id="hist-severity-filter" label="Severity" scale="s" width="auto">
              <calcite-option value="">All Severities</calcite-option>
              ${Object.values(AlertSeverity).map((s) => `<calcite-option value="${s}">${s}</calcite-option>`).join("")}
            </calcite-select>
            <calcite-select id="hist-status-filter" label="Status" scale="s" width="auto">
              <calcite-option value="">All</calcite-option>
              <calcite-option value="Open">Open</calcite-option>
              <calcite-option value="Acknowledged">Acknowledged</calcite-option>
              <calcite-option value="Resolved">Resolved</calcite-option>
            </calcite-select>
          </div>
          <calcite-list id="alert-history-list"></calcite-list>
        </div>

        <!-- Contacts Section (hidden by default) -->
        <div id="contacts-section" style="display:none;" class="mt-lg">
          <div class="panel-header">
            <h3>Alert Contacts</h3>
            <calcite-button id="btn-add-contact" icon-start="plus" appearance="outline" scale="s">Add</calcite-button>
          </div>
          <calcite-list id="contacts-list"></calcite-list>
        </div>
      </div>
    </div>
  `;

  bindEvents();
  loadActiveAlerts();
}

// ---------------------------------------------------------------------------
// Event Binding
// ---------------------------------------------------------------------------

function bindEvents() {
  _container.querySelector("#alert-list")?.addEventListener("calciteListChange", handleAlertSelect);
  _container.querySelector("#btn-ack-alert")?.addEventListener("click", handleAcknowledge);
  _container.querySelector("#btn-resolve-alert")?.addEventListener("click", handleResolve);
  _container.querySelector("#btn-manage-contacts")?.addEventListener("click", toggleContacts);
  _container.querySelector("#btn-alert-history")?.addEventListener("click", toggleHistory);
  _container.querySelector("#btn-add-contact")?.addEventListener("click", handleAddContact);

  _container.querySelector("#hist-severity-filter")?.addEventListener("calciteSelectChange", (e) => {
    _historyFilter.severity = e.target.value;
    loadAlertHistory();
  });
  _container.querySelector("#hist-status-filter")?.addEventListener("calciteSelectChange", (e) => {
    _historyFilter.status = e.target.value;
    loadAlertHistory();
  });
}

// ---------------------------------------------------------------------------
// Data Loading
// ---------------------------------------------------------------------------

/**
 * Load active (open + acknowledged) alerts.
 */
async function loadActiveAlerts() {
  const list = _container.querySelector("#alert-list");
  if (!list) return;
  list.loading = true;

  try {
    _alerts = await apiService.getActiveAlerts();
    renderAlertList(_alerts, list);
  } catch (err) {
    console.error("Failed to load alerts:", err);
    list.innerHTML = `<calcite-notice open kind="danger" scale="s"><div slot="message">${err.message}</div></calcite-notice>`;
  } finally {
    list.loading = false;
  }
}

async function loadAlertHistory() {
  const list = _container.querySelector("#alert-history-list");
  if (!list) return;

  const clauses = ["1=1"];
  if (_historyFilter.severity) clauses.push(`${Fields.ALERT_SEVERITY}='${_historyFilter.severity}'`);
  if (_historyFilter.status) clauses.push(`${Fields.ALERT_STATUS}='${_historyFilter.status}'`);

  try {
    const alerts = await apiService.queryAllFeatures(API.LAYERS.ALERTS, {
      where: clauses.join(" AND "),
      orderByFields: `${Fields.ALERT_CREATED} DESC`,
    });
    renderAlertList(alerts, list);
  } catch (err) {
    list.innerHTML = `<calcite-notice open kind="danger" scale="s"><div slot="message">${err.message}</div></calcite-notice>`;
  }
}

async function loadContacts() {
  const list = _container.querySelector("#contacts-list");
  if (!list) return;

  try {
    const contacts = await apiService.queryContacts();
    if (!contacts.length) {
      list.innerHTML = `<calcite-notice open kind="brand" scale="s"><div slot="message">No contacts configured.</div></calcite-notice>`;
      return;
    }

    list.innerHTML = contacts.map((c) => {
      const a = c.attributes;
      return `
        <calcite-list-item
          label="${a[Fields.CONTACT_NAME]}"
          description="${a[Fields.CONTACT_ROLE] || ''} | ${a[Fields.CONTACT_EMAIL] || ''} | ${a[Fields.CONTACT_PHONE] || ''}"
          data-oid="${a[Fields.OBJECTID]}"
        >
          <calcite-action slot="actions-end" icon="pencil" text="Edit" data-action="edit-contact" data-oid="${a[Fields.OBJECTID]}"></calcite-action>
          <calcite-action slot="actions-end" icon="trash" text="Remove" data-action="delete-contact" data-oid="${a[Fields.OBJECTID]}"></calcite-action>
        </calcite-list-item>
      `;
    }).join("");

    list.querySelectorAll("calcite-action[data-action='delete-contact']").forEach((btn) => {
      btn.addEventListener("click", () => handleDeleteContact(Number(btn.dataset.oid)));
    });
    list.querySelectorAll("calcite-action[data-action='edit-contact']").forEach((btn) => {
      btn.addEventListener("click", () => handleEditContact(Number(btn.dataset.oid)));
    });
  } catch (err) {
    list.innerHTML = `<calcite-notice open kind="danger" scale="s"><div slot="message">${err.message}</div></calcite-notice>`;
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderAlertList(alerts, listEl) {
  if (!alerts.length) {
    listEl.innerHTML = `<calcite-notice open kind="success" icon="check-circle" scale="s">
      <div slot="message">No alerts to display.</div>
    </calcite-notice>`;
    return;
  }

  listEl.innerHTML = alerts.map((alert) => {
    const a = alert.attributes;
    const severity = a[Fields.ALERT_SEVERITY] || AlertSeverity.INFO;
    const icon = AlertSeverityIcons[severity] || "information";
    const created = a[Fields.ALERT_CREATED] ? new Date(a[Fields.ALERT_CREATED]).toLocaleString() : "";
    const status = a[Fields.ALERT_STATUS] || "Open";
    const pulseClass = severity === AlertSeverity.CRITICAL && status === "Open" ? "alert-pulse" : "";

    return `
      <calcite-list-item
        class="${pulseClass}"
        value="${a[Fields.OBJECTID]}"
        label="${a[Fields.ALERT_MESSAGE] || 'Alert'}"
        description="${severity} | ${status} | ${created}"
        data-oid="${a[Fields.OBJECTID]}"
      >
        <calcite-icon slot="content-start" icon="${icon}" style="color:${SeverityColors[severity] || '#999'};" scale="s"></calcite-icon>
        <calcite-chip slot="content-end" scale="s" appearance="${status === 'Open' ? 'solid' : 'outline'}">${status}</calcite-chip>
      </calcite-list-item>
    `;
  }).join("");
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleAlertSelect(event) {
  const selected = event.target.selectedItems?.[0];
  if (!selected) return;

  const oid = Number(selected.dataset.oid || selected.value);
  _selectedAlert = _alerts.find((a) => a.attributes[Fields.OBJECTID] === oid);
  if (!_selectedAlert) return;

  const a = _selectedAlert.attributes;
  const detail = _container.querySelector("#alert-detail");
  detail.style.display = "block";

  _container.querySelector("#alert-detail-heading").textContent = a[Fields.ALERT_MESSAGE] || "Alert";
  _container.querySelector("#alert-detail-desc").textContent = `${a[Fields.ALERT_SEVERITY]} | ${a[Fields.ALERT_STATUS]}`;

  const body = _container.querySelector("#alert-detail-body");
  body.innerHTML = `
    <p><strong>Alert ID:</strong> ${a[Fields.ALERT_ID] || a[Fields.OBJECTID]}</p>
    <p><strong>Related Permit:</strong> ${a[Fields.ALERT_PERMIT_ID] || "N/A"}</p>
    <p><strong>Created:</strong> ${a[Fields.ALERT_CREATED] ? new Date(a[Fields.ALERT_CREATED]).toLocaleString() : "N/A"}</p>
    ${a[Fields.ALERT_ACKNOWLEDGED] ? `<p><strong>Acknowledged:</strong> ${new Date(a[Fields.ALERT_ACKNOWLEDGED]).toLocaleString()}</p>` : ""}
    ${a[Fields.ALERT_RESOLVED] ? `<p><strong>Resolved:</strong> ${new Date(a[Fields.ALERT_RESOLVED]).toLocaleString()}</p>` : ""}
  `;

  // Escalation chip
  const chip = _container.querySelector("#alert-escalation-chip");
  const isEscalated = a[Fields.ALERT_SEVERITY] === AlertSeverity.CRITICAL && a[Fields.ALERT_STATUS] === "Open";
  chip.textContent = isEscalated ? "Escalated" : "Normal";
  chip.setAttribute("kind", isEscalated ? "danger" : "neutral");

  // Enable/disable buttons
  const ackBtn = _container.querySelector("#btn-ack-alert");
  const resBtn = _container.querySelector("#btn-resolve-alert");
  ackBtn.disabled = a[Fields.ALERT_STATUS] !== "Open";
  resBtn.disabled = a[Fields.ALERT_STATUS] === "Resolved";

  // Highlight on map
  _highlightHandle?.remove();
  if (a[Fields.ALERT_PERMIT_ID]) {
    try {
      const permits = await apiService.queryPermits({ search: a[Fields.ALERT_PERMIT_ID] });
      if (permits.length && permits[0].geometry) {
        _highlightHandle = await highlightFeatures("permits", [permits[0].attributes[Fields.OBJECTID]]);
        zoomTo(permits[0]);
      }
    } catch {
      // Silent — map context is best-effort
    }
  }
}

async function handleAcknowledge() {
  if (!_selectedAlert) return;
  const btn = _container.querySelector("#btn-ack-alert");
  btn.loading = true;
  try {
    await apiService.acknowledgeAlert(_selectedAlert.attributes[Fields.OBJECTID]);
    showNotice("Alert acknowledged.", "success");
    await loadActiveAlerts();
    _container.querySelector("#alert-detail").style.display = "none";
  } catch (err) {
    showNotice(`Failed: ${err.message}`, "danger");
  } finally {
    btn.loading = false;
  }
}

async function handleResolve() {
  if (!_selectedAlert) return;
  const btn = _container.querySelector("#btn-resolve-alert");
  btn.loading = true;
  try {
    await apiService.resolveAlert(_selectedAlert.attributes[Fields.OBJECTID]);
    showNotice("Alert resolved.", "success");
    await loadActiveAlerts();
    _container.querySelector("#alert-detail").style.display = "none";
  } catch (err) {
    showNotice(`Failed: ${err.message}`, "danger");
  } finally {
    btn.loading = false;
  }
}

function toggleContacts() {
  const section = _container.querySelector("#contacts-section");
  const isVisible = section.style.display !== "none";
  section.style.display = isVisible ? "none" : "block";
  if (!isVisible) loadContacts();
}

function toggleHistory() {
  const section = _container.querySelector("#alert-history-section");
  const isVisible = section.style.display !== "none";
  section.style.display = isVisible ? "none" : "block";
  if (!isVisible) loadAlertHistory();
}

function handleAddContact() {
  const event = new CustomEvent("ecms-open-dialog", {
    bubbles: true,
    detail: { dialog: "manage-contacts", onSave: () => loadContacts() },
  });
  document.dispatchEvent(event);
}

function handleEditContact(objectId) {
  const event = new CustomEvent("ecms-open-dialog", {
    bubbles: true,
    detail: { dialog: "manage-contacts", objectId, onSave: () => loadContacts() },
  });
  document.dispatchEvent(event);
}

async function handleDeleteContact(objectId) {
  if (!confirm("Remove this contact?")) return;
  try {
    await apiService.deleteFeatures(API.LAYERS.CONTACTS, [objectId]);
    loadContacts();
    showNotice("Contact removed.", "success");
  } catch (err) {
    showNotice(`Failed: ${err.message}`, "danger");
  }
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

/**
 * Refresh alerts externally.
 */
export function refresh() {
  loadActiveAlerts();
}

/**
 * Get count of active alerts (for badge display).
 * @returns {number}
 */
export function getActiveCount() {
  return _alerts.length;
}

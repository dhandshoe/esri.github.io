/**
 * Permit form component for creating and editing environmental permits.
 * Uses Calcite Design System form elements.
 * @module components/permit-form
 */

import { Fields, PermitType, PermitTypeLabels, ComplianceStatus } from "../utils/constants.js";
import * as api from "../services/api-service.js";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let _container = null;
let _mode = "create"; // create | edit
let _currentPermit = null;
let _onSave = null;
let _onCancel = null;

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Initialize the permit form.
 * @param {object} options
 * @param {HTMLElement} options.container - DOM element to render into.
 * @param {Function} [options.onSave] - Callback after successful save.
 * @param {Function} [options.onCancel] - Callback on cancel.
 */
export function initialize({ container, onSave, onCancel }) {
  _container = container;
  _onSave = onSave;
  _onCancel = onCancel;
  render();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Open the form for creating a new permit.
 */
export function openCreate() {
  _mode = "create";
  _currentPermit = null;
  render();
  show();
}

/**
 * Open the form for editing an existing permit.
 * @param {object} permitAttrs - Permit attributes to populate the form.
 */
export function openEdit(permitAttrs) {
  _mode = "edit";
  _currentPermit = permitAttrs;
  render();
  populateForm(permitAttrs);
  show();
}

/**
 * Close and reset the form.
 */
export function close() {
  _mode = "create";
  _currentPermit = null;
  hide();
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function render() {
  if (!_container) return;

  const title = _mode === "edit" ? "Edit Permit" : "New Permit";

  _container.innerHTML = `
    <calcite-panel heading="${title}" closable>
      <calcite-action slot="header-actions-end" icon="x" id="permit-form-close"></calcite-action>

      <form id="permit-form" class="ecms-form">
        <calcite-label>
          Permit ID
          <calcite-input id="field-permit-id" name="PermitID"
            placeholder="Auto-generated" ${_mode === "edit" ? "read-only" : ""}
          ></calcite-input>
        </calcite-label>

        <calcite-label>
          Permit Name *
          <calcite-input id="field-permit-name" name="PermitName"
            required placeholder="Enter permit name"
          ></calcite-input>
        </calcite-label>

        <calcite-label>
          Permit Type *
          <calcite-select id="field-permit-type" name="PermitType">
            ${Object.entries(PermitTypeLabels)
              .map(([val, label]) => `<calcite-option value="${val}">${label}</calcite-option>`)
              .join("")}
          </calcite-select>
        </calcite-label>

        <calcite-label>
          Issuing Agency
          <calcite-input id="field-agency" name="IssuingAgency"
            placeholder="e.g., FERC, EPA, ADEC"
          ></calcite-input>
        </calcite-label>

        <calcite-label>
          Responsible Party
          <calcite-input id="field-responsible" name="ResponsibleParty"
            placeholder="Name or organization"
          ></calcite-input>
        </calcite-label>

        <calcite-label>
          Issue Date
          <calcite-input-date-picker id="field-issue-date" name="IssueDate">
          </calcite-input-date-picker>
        </calcite-label>

        <calcite-label>
          Expiration Date
          <calcite-input-date-picker id="field-expiration-date" name="ExpirationDate">
          </calcite-input-date-picker>
        </calcite-label>

        <calcite-label>
          Next Review Date
          <calcite-input-date-picker id="field-review-date" name="NextReviewDate">
          </calcite-input-date-picker>
        </calcite-label>

        <calcite-label>
          Description
          <calcite-input-text-area id="field-description" name="Description"
            placeholder="Permit description and notes" rows="4"
          ></calcite-input-text-area>
        </calcite-label>

        <div class="ecms-form-actions">
          <calcite-button id="permit-form-save" appearance="solid" kind="brand">
            ${_mode === "edit" ? "Update" : "Create"} Permit
          </calcite-button>
          <calcite-button id="permit-form-cancel" appearance="outline" kind="neutral">
            Cancel
          </calcite-button>
        </div>
      </form>
    </calcite-panel>
  `;

  bindEvents();
}

function bindEvents() {
  const closeBtn = _container.querySelector("#permit-form-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      close();
      _onCancel?.();
    });
  }

  const cancelBtn = _container.querySelector("#permit-form-cancel");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      close();
      _onCancel?.();
    });
  }

  const saveBtn = _container.querySelector("#permit-form-save");
  if (saveBtn) {
    saveBtn.addEventListener("click", handleSave);
  }

  // Close panel via Calcite close event
  const panel = _container.querySelector("calcite-panel");
  if (panel) {
    panel.addEventListener("calcitePanelClose", () => {
      close();
      _onCancel?.();
    });
  }
}

// ---------------------------------------------------------------------------
// Form Population
// ---------------------------------------------------------------------------

function populateForm(attrs) {
  if (!attrs) return;

  setFieldValue("field-permit-id", attrs[Fields.PERMIT_ID]);
  setFieldValue("field-permit-name", attrs[Fields.PERMIT_NAME]);
  setSelectValue("field-permit-type", attrs[Fields.PERMIT_TYPE]);
  setFieldValue("field-agency", attrs[Fields.ISSUING_AGENCY]);
  setFieldValue("field-responsible", attrs[Fields.RESPONSIBLE_PARTY]);
  setDateValue("field-issue-date", attrs[Fields.ISSUE_DATE]);
  setDateValue("field-expiration-date", attrs[Fields.EXPIRATION_DATE]);
  setDateValue("field-review-date", attrs[Fields.NEXT_REVIEW_DATE]);
  setFieldValue("field-description", attrs[Fields.DESCRIPTION]);
}

function setFieldValue(id, value) {
  const el = _container.querySelector(`#${id}`);
  if (el && value != null) el.value = String(value);
}

function setSelectValue(id, value) {
  const el = _container.querySelector(`#${id}`);
  if (el && value != null) el.value = value;
}

function setDateValue(id, value) {
  const el = _container.querySelector(`#${id}`);
  if (!el || !value) return;
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  el.value = date.toISOString().split("T")[0];
}

// ---------------------------------------------------------------------------
// Form Collection
// ---------------------------------------------------------------------------

function collectFormData() {
  const get = (id) => _container.querySelector(`#${id}`)?.value?.trim() || null;
  const getDate = (id) => {
    const val = get(id);
    return val ? new Date(val).getTime() : null;
  };

  return {
    [Fields.PERMIT_ID]: get("field-permit-id"),
    [Fields.PERMIT_NAME]: get("field-permit-name"),
    [Fields.PERMIT_TYPE]: get("field-permit-type"),
    [Fields.ISSUING_AGENCY]: get("field-agency"),
    [Fields.RESPONSIBLE_PARTY]: get("field-responsible"),
    [Fields.ISSUE_DATE]: getDate("field-issue-date"),
    [Fields.EXPIRATION_DATE]: getDate("field-expiration-date"),
    [Fields.NEXT_REVIEW_DATE]: getDate("field-review-date"),
    [Fields.DESCRIPTION]: get("field-description"),
  };
}

function validateForm(data) {
  const errors = [];
  if (!data[Fields.PERMIT_NAME]) errors.push("Permit Name is required.");
  if (!data[Fields.PERMIT_TYPE]) errors.push("Permit Type is required.");
  return errors;
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

async function handleSave(e) {
  e.preventDefault();

  const data = collectFormData();
  const errors = validateForm(data);

  if (errors.length > 0) {
    showNotice("error", errors.join(" "));
    return;
  }

  const saveBtn = _container.querySelector("#permit-form-save");
  if (saveBtn) {
    saveBtn.loading = true;
    saveBtn.disabled = true;
  }

  try {
    let result;
    if (_mode === "edit" && _currentPermit) {
      const objectId = _currentPermit[Fields.OBJECTID];
      data[Fields.OBJECTID] = objectId;
      result = await api.updateFeatures(API.LAYERS.PERMITS, [{ attributes: data }]);
    } else {
      // Generate permit ID for new permits
      if (!data[Fields.PERMIT_ID]) {
        data[Fields.PERMIT_ID] = `PRM-${Date.now().toString(36).toUpperCase()}`;
      }
      data[Fields.COMPLIANCE_STATUS] = ComplianceStatus.UNKNOWN;
      data[Fields.RISK_SCORE] = 0;
      result = await api.addFeatures(API.LAYERS.PERMITS, [{ attributes: data }]);
    }

    showNotice("success", `Permit ${_mode === "edit" ? "updated" : "created"} successfully.`);
    _onSave?.(data, result);
    close();
  } catch (error) {
    console.error("Save failed:", error);
    showNotice("error", `Save failed: ${error.message}`);
  } finally {
    if (saveBtn) {
      saveBtn.loading = false;
      saveBtn.disabled = false;
    }
  }
}

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------

function showNotice(kind, message) {
  // Remove existing notices
  _container.querySelectorAll("calcite-notice").forEach((n) => n.remove());

  const notice = document.createElement("calcite-notice");
  notice.kind = kind;
  notice.open = true;
  notice.closable = true;
  notice.width = "full";
  notice.innerHTML = `<span slot="message">${message}</span>`;

  const form = _container.querySelector("#permit-form");
  form?.prepend(notice);

  if (kind === "success") {
    setTimeout(() => notice.remove(), 3000);
  }
}

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

function show() {
  if (_container) _container.hidden = false;
}

function hide() {
  if (_container) _container.hidden = true;
}

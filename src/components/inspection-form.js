/**
 * Inspection form component for recording field inspection results.
 * @module components/inspection-form
 */

import { Fields } from "../utils/constants.js";
import * as api from "../services/api-service.js";
import { API } from "../utils/constants.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INSPECTION_RESULTS = [
  { value: "Pass", label: "Pass" },
  { value: "Fail", label: "Fail" },
  { value: "PassWithConditions", label: "Pass with Conditions" },
  { value: "Incomplete", label: "Incomplete" },
];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let _container = null;
let _onSave = null;
let _onCancel = null;
let _relatedPermitId = null;

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Initialize the inspection form.
 * @param {object} options
 * @param {HTMLElement} options.container - DOM element to render into.
 * @param {Function} [options.onSave] - Callback after successful save.
 * @param {Function} [options.onCancel] - Callback on cancel.
 */
export function initialize({ container, onSave, onCancel }) {
  _container = container;
  _onSave = onSave;
  _onCancel = onCancel;
}

/**
 * Open the form for a new inspection linked to a permit.
 * @param {string} permitId - The related permit ID.
 * @param {object} [location] - Optional {latitude, longitude} for the inspection.
 */
export function openNew(permitId, location) {
  _relatedPermitId = permitId;
  render(location);
  show();
}

/**
 * Close the form.
 */
export function close() {
  _relatedPermitId = null;
  hide();
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function render(location) {
  if (!_container) return;

  const today = new Date().toISOString().split("T")[0];

  _container.innerHTML = `
    <calcite-panel heading="New Inspection" closable>
      <form id="inspection-form" class="ecms-form">
        <calcite-notice kind="info" open width="full">
          <span slot="message">Recording inspection for permit: ${_relatedPermitId || "N/A"}</span>
        </calcite-notice>

        <calcite-label>
          Inspection Date
          <calcite-input-date-picker id="insp-date" value="${today}">
          </calcite-input-date-picker>
        </calcite-label>

        <calcite-label>
          Inspector Name *
          <calcite-input id="insp-inspector" placeholder="Full name" required>
          </calcite-input>
        </calcite-label>

        <calcite-label>
          Result *
          <calcite-select id="insp-result">
            ${INSPECTION_RESULTS.map(
              (r) => `<calcite-option value="${r.value}">${r.label}</calcite-option>`
            ).join("")}
          </calcite-select>
        </calcite-label>

        <calcite-label>
          Findings
          <calcite-input-text-area id="insp-findings" rows="4"
            placeholder="Describe inspection findings, observations, and any violations noted"
          ></calcite-input-text-area>
        </calcite-label>

        <calcite-label>
          Corrective Actions Required
          <calcite-input-text-area id="insp-corrective" rows="3"
            placeholder="List any corrective actions or follow-up items"
          ></calcite-input-text-area>
        </calcite-label>

        ${
          location
            ? `<calcite-notice kind="success" open width="full">
                <span slot="message">Location: ${location.latitude?.toFixed(5)}, ${location.longitude?.toFixed(5)}</span>
              </calcite-notice>`
            : ""
        }

        <div class="ecms-form-actions">
          <calcite-button id="insp-save" appearance="solid" kind="brand">
            Save Inspection
          </calcite-button>
          <calcite-button id="insp-cancel" appearance="outline" kind="neutral">
            Cancel
          </calcite-button>
        </div>
      </form>
    </calcite-panel>
  `;

  // Store location for save
  _container._inspLocation = location;
  bindEvents();
}

function bindEvents() {
  const panel = _container.querySelector("calcite-panel");
  panel?.addEventListener("calcitePanelClose", () => {
    close();
    _onCancel?.();
  });

  _container.querySelector("#insp-cancel")?.addEventListener("click", () => {
    close();
    _onCancel?.();
  });

  _container.querySelector("#insp-save")?.addEventListener("click", handleSave);
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

async function handleSave(e) {
  e.preventDefault();

  const inspector = _container.querySelector("#insp-inspector")?.value?.trim();
  const result = _container.querySelector("#insp-result")?.value;
  const findings = _container.querySelector("#insp-findings")?.value?.trim();
  const corrective = _container.querySelector("#insp-corrective")?.value?.trim();
  const dateVal = _container.querySelector("#insp-date")?.value;

  if (!inspector) {
    showNotice("error", "Inspector name is required.");
    return;
  }

  const saveBtn = _container.querySelector("#insp-save");
  if (saveBtn) {
    saveBtn.loading = true;
    saveBtn.disabled = true;
  }

  try {
    const attributes = {
      InspectionID: `INS-${Date.now().toString(36).toUpperCase()}`,
      RelatedPermitID: _relatedPermitId,
      InspectionDate: dateVal ? new Date(dateVal).getTime() : Date.now(),
      InspectorName: inspector,
      InspectionResult: result,
      Findings: findings,
      CorrectiveActions: corrective,
    };

    const feature = { attributes };
    const location = _container._inspLocation;
    if (location) {
      feature.geometry = {
        x: location.longitude,
        y: location.latitude,
        spatialReference: { wkid: 4326 },
      };
    }

    // InspectionLocations is typically layer index 6 or similar
    const layerIndex = API.LAYERS.CONTACTS + 1; // Adjust based on actual schema
    await api.addFeatures(layerIndex, [feature]);

    showNotice("success", "Inspection saved successfully.");
    _onSave?.(attributes);
    setTimeout(() => close(), 1500);
  } catch (error) {
    console.error("Inspection save failed:", error);
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
  _container.querySelectorAll("calcite-notice.form-notice").forEach((n) => n.remove());
  const notice = document.createElement("calcite-notice");
  notice.kind = kind;
  notice.open = true;
  notice.closable = true;
  notice.width = "full";
  notice.classList.add("form-notice");
  notice.innerHTML = `<span slot="message">${message}</span>`;

  const form = _container.querySelector("#inspection-form");
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

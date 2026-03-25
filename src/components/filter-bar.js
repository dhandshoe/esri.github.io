/**
 * Filter bar component for the ECMS application.
 * Provides filtering controls for compliance status, permit type, date range,
 * risk score, and issuing agency.
 * @module components/filter-bar
 */

import {
  ComplianceStatus,
  ComplianceStatusLabels,
  PermitType,
  PermitTypeLabels,
  StatusColors,
} from "../utils/constants.js";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let _container = null;
let _onChange = null;
let _currentFilters = {
  status: null,
  permitType: null,
  dateFrom: null,
  dateTo: null,
  riskMin: 0,
  riskMax: 100,
  agency: null,
  searchText: null,
};

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Initialize the filter bar.
 * @param {object} options
 * @param {HTMLElement} options.container - DOM element to render into.
 * @param {Function} options.onChange - Callback when filters change. Receives filter object.
 */
export function initialize({ container, onChange }) {
  _container = container;
  _onChange = onChange;
  render();
}

/**
 * Get current active filters.
 * @returns {object} Current filter state.
 */
export function getFilters() {
  return { ..._currentFilters };
}

/**
 * Reset all filters to defaults.
 */
export function resetFilters() {
  _currentFilters = {
    status: null,
    permitType: null,
    dateFrom: null,
    dateTo: null,
    riskMin: 0,
    riskMax: 100,
    agency: null,
    searchText: null,
  };
  render();
  _onChange?.(_currentFilters);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function render() {
  if (!_container) return;

  _container.innerHTML = `
    <div class="ecms-filter-bar">
      <!-- Status chips -->
      <div class="ecms-filter-group">
        <span class="ecms-filter-label">Status</span>
        <calcite-chip-group id="filter-status-chips" selection-mode="single-persist">
          <calcite-chip value="" selected>All</calcite-chip>
          ${Object.entries(ComplianceStatusLabels)
            .map(
              ([val, label]) =>
                `<calcite-chip value="${val}"
                  ${_currentFilters.status === val ? "selected" : ""}
                  style="--calcite-color-brand: ${StatusColors[val]?.fill || "#666"}"
                >${label}</calcite-chip>`
            )
            .join("")}
        </calcite-chip-group>
      </div>

      <!-- Permit type -->
      <div class="ecms-filter-group">
        <calcite-label layout="inline">
          Type
          <calcite-select id="filter-permit-type" scale="s">
            <calcite-option value="">All Types</calcite-option>
            ${Object.entries(PermitTypeLabels)
              .map(
                ([val, label]) =>
                  `<calcite-option value="${val}"
                    ${_currentFilters.permitType === val ? "selected" : ""}
                  >${label}</calcite-option>`
              )
              .join("")}
          </calcite-select>
        </calcite-label>
      </div>

      <!-- Risk score slider -->
      <div class="ecms-filter-group">
        <calcite-label layout="inline">
          Risk Score
          <calcite-slider id="filter-risk-slider" min="0" max="100"
            min-value="${_currentFilters.riskMin}"
            max-value="${_currentFilters.riskMax}"
            step="5" label-handles ticks="25" scale="s"
          ></calcite-slider>
        </calcite-label>
      </div>

      <!-- Date range -->
      <div class="ecms-filter-group">
        <calcite-label layout="inline">
          Expiring Between
          <calcite-input-date-picker id="filter-date-range" range scale="s">
          </calcite-input-date-picker>
        </calcite-label>
      </div>

      <!-- Agency text filter -->
      <div class="ecms-filter-group">
        <calcite-label layout="inline">
          Agency
          <calcite-input id="filter-agency" scale="s"
            placeholder="Filter by agency" clearable
            value="${_currentFilters.agency || ""}"
          ></calcite-input>
        </calcite-label>
      </div>

      <!-- Actions -->
      <div class="ecms-filter-actions">
        <calcite-button id="filter-reset-btn" appearance="outline" scale="s"
          icon-start="reset"
        >Reset</calcite-button>
      </div>
    </div>
  `;

  bindEvents();
}

// ---------------------------------------------------------------------------
// Event Binding
// ---------------------------------------------------------------------------

function bindEvents() {
  // Status chips
  const chipGroup = _container.querySelector("#filter-status-chips");
  if (chipGroup) {
    chipGroup.addEventListener("calciteChipGroupSelect", (e) => {
      const selected = chipGroup.querySelector("calcite-chip[selected]");
      _currentFilters.status = selected?.value || null;
      emitChange();
    });
  }

  // Permit type
  const typeSelect = _container.querySelector("#filter-permit-type");
  if (typeSelect) {
    typeSelect.addEventListener("calciteSelectChange", () => {
      _currentFilters.permitType = typeSelect.value || null;
      emitChange();
    });
  }

  // Risk slider
  const slider = _container.querySelector("#filter-risk-slider");
  if (slider) {
    slider.addEventListener("calciteSliderChange", () => {
      _currentFilters.riskMin = slider.minValue;
      _currentFilters.riskMax = slider.maxValue;
      emitChange();
    });
  }

  // Date range
  const datePicker = _container.querySelector("#filter-date-range");
  if (datePicker) {
    datePicker.addEventListener("calciteInputDatePickerChange", () => {
      const values = datePicker.value;
      if (Array.isArray(values) && values.length === 2) {
        _currentFilters.dateFrom = values[0];
        _currentFilters.dateTo = values[1];
      } else {
        _currentFilters.dateFrom = null;
        _currentFilters.dateTo = null;
      }
      emitChange();
    });
  }

  // Agency input
  const agencyInput = _container.querySelector("#filter-agency");
  if (agencyInput) {
    let timer;
    agencyInput.addEventListener("calciteInputInput", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        _currentFilters.agency = agencyInput.value?.trim() || null;
        emitChange();
      }, 300);
    });
  }

  // Reset button
  const resetBtn = _container.querySelector("#filter-reset-btn");
  if (resetBtn) {
    resetBtn.addEventListener("click", resetFilters);
  }
}

// ---------------------------------------------------------------------------
// Where Clause Builder
// ---------------------------------------------------------------------------

/**
 * Build a SQL where clause from the current filters for use in feature queries.
 * @returns {string} SQL where clause, or "1=1" if no filters active.
 */
export function buildWhereClause() {
  const clauses = [];

  if (_currentFilters.status) {
    clauses.push(`ComplianceStatus = '${_currentFilters.status}'`);
  }

  if (_currentFilters.permitType) {
    clauses.push(`PermitType = '${_currentFilters.permitType}'`);
  }

  if (_currentFilters.riskMin > 0) {
    clauses.push(`RiskScore >= ${_currentFilters.riskMin}`);
  }
  if (_currentFilters.riskMax < 100) {
    clauses.push(`RiskScore <= ${_currentFilters.riskMax}`);
  }

  if (_currentFilters.dateFrom) {
    clauses.push(`ExpirationDate >= timestamp '${_currentFilters.dateFrom}'`);
  }
  if (_currentFilters.dateTo) {
    clauses.push(`ExpirationDate <= timestamp '${_currentFilters.dateTo}'`);
  }

  if (_currentFilters.agency) {
    clauses.push(`IssuingAgency LIKE '%${_currentFilters.agency}%'`);
  }

  return clauses.length > 0 ? clauses.join(" AND ") : "1=1";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emitChange() {
  _onChange?.({ ..._currentFilters });
}

/**
 * Main application shell component for the ECMS web application.
 * Orchestrates layout, routing between panels, and inter-component communication.
 * Built on Calcite Design System's calcite-shell element.
 * @module components/app-shell
 */

import { API, Defaults, ComplianceStatus } from "../utils/constants.js";
import * as mapManager from "../js/map-manager.js";
import * as compliancePanel from "../js/compliance-panel.js";
import * as alertPanel from "../js/alert-panel.js";
import * as dashboardPanel from "../js/dashboard-panel.js";
import * as driverPanel from "../js/driver-panel.js";
import * as obligationPanel from "../js/obligation-panel.js";
import * as taskPanel from "../js/task-panel.js";
import * as documentPanel from "../js/document-panel.js";
import * as trainingPanel from "../js/training-panel.js";
import * as mocPanel from "../js/moc-panel.js";
import * as transmittalPanel from "../js/transmittal-panel.js";
import * as stakeholderPanel from "../js/stakeholder-panel.js";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let _initialized = false;
let _activePanel = "compliance"; // compliance | alerts | dashboard | graph | drivers | obligations | tasks | documents | training | moc | transmittals | stakeholders
let _refreshTimer = null;

// ---------------------------------------------------------------------------
// DOM References
// ---------------------------------------------------------------------------

const EL = {
  shell: () => document.getElementById("app-shell"),
  mapContainer: () => document.getElementById("map-container"),
  leftPanel: () => document.getElementById("left-panel"),
  rightPanel: () => document.getElementById("right-panel"),
  bottomPanel: () => document.getElementById("bottom-panel"),
  navItems: () => document.querySelectorAll("calcite-navigation-item"),
  statusBar: () => document.getElementById("status-bar"),
  searchInput: () => document.getElementById("search-input"),
  refreshBtn: () => document.getElementById("refresh-btn"),
  userMenu: () => document.getElementById("user-menu"),
};

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Initialize the application shell and all child components.
 * @param {object} [options] - Configuration overrides.
 * @param {string} [options.portalUrl] - ArcGIS Enterprise portal URL.
 * @param {string} [options.featureServiceUrl] - Feature service URL.
 */
export async function initialize(options = {}) {
  if (_initialized) return;

  // Apply config overrides
  if (options.portalUrl || options.featureServiceUrl) {
    window.__ECMS_CONFIG = {
      ...window.__ECMS_CONFIG,
      ...options,
    };
  }

  try {
    updateStatus("Initializing...");

    // Initialize map
    await mapManager.initMap(EL.mapContainer()?.id || "map-container");

    // Initialize original panels (use init(container) signature)
    compliancePanel.init(EL.leftPanel());
    alertPanel.init(EL.rightPanel());
    dashboardPanel.init(EL.bottomPanel());

    // Initialize expanded panels (use initialize({container}) signature)
    driverPanel.initialize({ container: EL.leftPanel() });
    obligationPanel.initialize({ container: EL.leftPanel() });
    taskPanel.initialize({ container: EL.leftPanel() });
    documentPanel.initialize({ container: EL.leftPanel() });
    trainingPanel.initialize({ container: EL.leftPanel() });
    mocPanel.initialize({ container: EL.leftPanel() });
    transmittalPanel.initialize({ container: EL.leftPanel() });
    stakeholderPanel.initialize({ container: EL.leftPanel() });

    // Wire up navigation
    bindNavigation();
    bindSearch();
    bindRefresh();

    // Start auto-refresh
    startAutoRefresh();

    _initialized = true;
    updateStatus("Ready");
  } catch (error) {
    console.error("App initialization failed:", error);
    updateStatus(`Error: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

function bindNavigation() {
  const navItems = EL.navItems();
  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      const panel = item.dataset.panel;
      if (panel) switchPanel(panel);
    });
  });
}

/**
 * Switch the active panel view.
 * @param {string} panelName - Panel identifier.
 */
export function switchPanel(panelName) {
  _activePanel = panelName;

  // Update nav item active state
  EL.navItems().forEach((item) => {
    item.active = item.dataset.panel === panelName;
  });

  // Toggle panel visibility
  const panels = document.querySelectorAll(".ecms-panel");
  panels.forEach((panel) => {
    panel.hidden = panel.dataset.panel !== panelName;
  });

  // Trigger panel-specific refresh
  switch (panelName) {
    case "compliance":
      compliancePanel.refresh();
      break;
    case "alerts":
      alertPanel.refresh();
      break;
    case "dashboard":
      dashboardPanel.refresh();
      break;
    case "drivers":
      driverPanel.refresh();
      break;
    case "obligations":
      obligationPanel.refresh();
      break;
    case "tasks":
      taskPanel.refresh();
      break;
    case "documents":
      documentPanel.refresh();
      break;
    case "training":
      trainingPanel.refresh();
      break;
    case "moc":
      mocPanel.refresh();
      break;
    case "transmittals":
      transmittalPanel.refresh();
      break;
    case "stakeholders":
      stakeholderPanel.refresh();
      break;
  }
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

function bindSearch() {
  const input = EL.searchInput();
  if (!input) return;

  let debounceTimer;
  input.addEventListener("calciteInputInput", (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const query = e.target.value?.trim();
      if (query && query.length >= 2) {
        performSearch(query);
      }
    }, 300);
  });
}

async function performSearch(query) {
  updateStatus(`Searching: ${query}`);

  try {
    const results = await mapManager.searchFeatures(query);
    if (results && results.length > 0) {
      // Highlight and zoom to first result
      const oids = results.map((f) => f.attributes?.OBJECTID).filter(Boolean);
      mapManager.highlightFeatures("permits", oids);
      if (results[0]?.geometry) {
        mapManager.zoomToFeature(results[0]);
      }
      updateStatus(`Found ${results.length} result(s)`);
    } else {
      updateStatus("No results found");
    }
  } catch (error) {
    console.error("Search failed:", error);
    updateStatus("Search failed");
  }
}

// ---------------------------------------------------------------------------
// Auto-Refresh
// ---------------------------------------------------------------------------

function bindRefresh() {
  const btn = EL.refreshBtn();
  if (btn) {
    btn.addEventListener("click", () => refreshAll());
  }
}

function startAutoRefresh() {
  if (_refreshTimer) clearInterval(_refreshTimer);
  _refreshTimer = setInterval(() => {
    refreshAll();
  }, Defaults.REFRESH_INTERVAL_MS);
}

/**
 * Refresh all panels and map data.
 */
export async function refreshAll() {
  updateStatus("Refreshing...");

  try {
    await Promise.all([
      mapManager.refreshLayers(),
      compliancePanel.refresh(),
      alertPanel.refresh(),
      dashboardPanel.refresh(),
      driverPanel.refresh(),
      obligationPanel.refresh(),
      taskPanel.refresh(),
    ]);
    updateStatus("Updated " + new Date().toLocaleTimeString());
  } catch (error) {
    console.error("Refresh failed:", error);
    updateStatus("Refresh failed");
  }
}

// ---------------------------------------------------------------------------
// Event Handlers
// ---------------------------------------------------------------------------

function handlePermitSelect(permit) {
  if (!permit) return;
  mapManager.zoomToFeature(permit);
  mapManager.openPopup(permit);
}

function handleStatusFilter(status) {
  mapManager.filterByStatus(status);
}

function handleAlertSelect(alert) {
  if (!alert) return;
  const permitId = alert.attributes?.RelatedPermitID;
  if (permitId) {
    mapManager.zoomToPermit(permitId);
  }
}

function handleAlertAction(action, alertItem) {
  switch (action) {
    case "zoom":
      handleAlertSelect(alertItem);
      break;
    default:
      // Acknowledge/resolve handled internally by alert-panel
      alertPanel.refresh();
      break;
  }
}

// ---------------------------------------------------------------------------
// Status Bar
// ---------------------------------------------------------------------------

function updateStatus(message) {
  const bar = EL.statusBar();
  if (bar) {
    bar.textContent = message;
  }
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/**
 * Destroy the application and release resources.
 */
export function destroy() {
  if (_refreshTimer) {
    clearInterval(_refreshTimer);
    _refreshTimer = null;
  }
  mapManager.destroy();
  _initialized = false;
}
